/**
 * Global in-process rate limiter for Meteora datapi.
 * Shared across dlmm.datapi.meteora.ag and portfolio.datapi.meteora.ag.
 * Limit: 300 req/min (~5 req/s), but we target 4 req/s to be safe.
 *
 * Every HTTP attempt (first try and each retry) goes through the limiter.
 * Retries: 429 (honouring Retry-After, pausing the whole queue), 5xx, network errors and timeouts.
 * Never retried: 404 and other 4xx. A 404 means Meteora has no data for that resource:
 * fetchMeteora throws a MeteoraHttpError with status 404 (check with isMeteoraNotFound),
 * fetchMeteoraOrNull returns null. 404s are negatively cached for a short time.
 */

interface RateLimitState {
  remaining: number;
  resetAt: number;
  lastRequest: number;
  pausedUntil: number;
  queue: Array<() => void>;
  processing: boolean;
}

const RATE_LIMIT_DEFAULT_WAIT_MS = 60_000;
const RATE_LIMIT_MAX_WAIT_MS = 120_000;

class MeteoraLimiter {
  private state: RateLimitState = {
    remaining: 300,
    resetAt: Date.now() + 60000,
    lastRequest: 0,
    pausedUntil: 0,
    queue: [],
    processing: false,
  };

  private readonly minDelayMs = 250; // ~4 req/s

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.state.queue.push(resolve);
      if (!this.state.processing) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.state.processing || this.state.queue.length === 0) return;

    this.state.processing = true;

    try {
      while (this.state.queue.length > 0) {
        // Global pause after a 429
        const pauseMs = this.state.pausedUntil - Date.now();
        if (pauseMs > 0) {
          await this.sleep(pauseMs);
        }

        // Enforce minimum delay between requests
        const timeSinceLastRequest = Date.now() - this.state.lastRequest;
        if (timeSinceLastRequest < this.minDelayMs) {
          await this.sleep(this.minDelayMs - timeSinceLastRequest);
        }

        // Check if we're close to rate limit
        if (this.state.remaining < 10 && Date.now() < this.state.resetAt) {
          const waitMs = Math.min(this.state.resetAt - Date.now() + 1000, RATE_LIMIT_MAX_WAIT_MS); // +1s buffer
          console.log(`[meteora-limiter] Low remaining (${this.state.remaining}), waiting ${waitMs}ms until reset`);
          await this.sleep(waitMs);
          this.state.remaining = 300; // Reset after waiting
        }

        this.state.lastRequest = Date.now();
        const resolve = this.state.queue.shift();
        if (resolve) resolve();
      }
    } finally {
      this.state.processing = false;
    }
  }

  updateFromHeaders(headers: Headers): void {
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");

    if (remaining) {
      const n = parseInt(remaining, 10);
      if (Number.isFinite(n)) this.state.remaining = n;
    }

    if (reset) {
      // Epoch seconds
      const resetSeconds = parseInt(reset, 10);
      if (Number.isFinite(resetSeconds)) this.state.resetAt = resetSeconds * 1000;
    }
  }

  /** Pause the whole queue after a 429. The caller then re-acquires a slot before retrying. */
  pauseForRateLimit(retryAfter?: string | null): number {
    const seconds = retryAfter ? parseInt(retryAfter, 10) : NaN;
    const waitMs = Number.isFinite(seconds) && seconds >= 0
      ? Math.min(seconds * 1000, RATE_LIMIT_MAX_WAIT_MS)
      : RATE_LIMIT_DEFAULT_WAIT_MS;
    console.log(`[meteora-limiter] 429 received, pausing queue for ${waitMs}ms`);
    this.state.pausedUntil = Math.max(this.state.pausedUntil, Date.now() + waitMs);
    this.state.remaining = 300;
    this.state.resetAt = Date.now() + waitMs + 60000;
    return waitMs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const meteoraLimiter = new MeteoraLimiter();

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data;
  }

  set(key: string, data: T, ttlMs: number): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const meteoraCache = new LRUCache<unknown>(1000);

/** Non-2xx response from Meteora. `status` is the HTTP status. */
export class MeteoraHttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    // Message format kept stable ("Meteora API error: <status>"); callers match on it.
    super(`Meteora API error: ${status}`);
    this.name = "MeteoraHttpError";
    this.status = status;
    this.url = url;
  }
}

/** True when Meteora answered 404, i.e. it has no data for that wallet/resource. */
export function isMeteoraNotFound(error: unknown): boolean {
  return error instanceof MeteoraHttpError && error.status === 404;
}

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const NOT_FOUND_TTL_MS = 60_000;
const NOT_FOUND = Symbol("meteora-not-found");

const inflight = new Map<string, Promise<unknown>>();

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  return 1000 * Math.pow(2, attempt - 1); // 1s, 2s
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, ttlMs: number): Promise<unknown> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Every attempt, including retries, takes a slot from the 4 rps limiter.
    await meteoraLimiter.acquire();

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Network error or timeout: retry with backoff
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt));
      continue;
    }

    meteoraLimiter.updateFromHeaders(res.headers);

    if (res.ok) {
      const data: unknown = await res.json();
      meteoraCache.set(url, data, ttlMs);
      return data;
    }

    // Drain the body so the connection can be reused
    await res.body?.cancel().catch(() => undefined);

    const error = new MeteoraHttpError(res.status, url);
    if (res.status === 404) {
      meteoraCache.set(url, NOT_FOUND, Math.min(ttlMs, NOT_FOUND_TTL_MS));
      throw error;
    }
    if (!isRetryableStatus(res.status)) throw error; // other 4xx: fail fast

    lastError = error;
    if (attempt >= MAX_ATTEMPTS) break;

    if (res.status === 429) {
      meteoraLimiter.pauseForRateLimit(res.headers.get("retry-after"));
    } else {
      await sleep(backoffMs(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Meteora: max retries exceeded");
}

/**
 * Rate-limited, cached GET against Meteora datapi.
 * Throws MeteoraHttpError (404 = no data, see isMeteoraNotFound) or a network error.
 */
export async function fetchMeteora<T = unknown>(url: string, ttlMs = 120000): Promise<T> {
  const cached = meteoraCache.get(url);
  if (cached === NOT_FOUND) throw new MeteoraHttpError(404, url);
  if (cached) return cached as T;

  // Share one upstream request between concurrent callers of the same URL
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetchWithRetry(url, ttlMs).finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  return (await pending) as T;
}

/** Like fetchMeteora, but resolves to null when Meteora has no data (404). */
export async function fetchMeteoraOrNull<T = unknown>(url: string, ttlMs = 120000): Promise<T | null> {
  try {
    return await fetchMeteora<T>(url, ttlMs);
  } catch (error) {
    if (isMeteoraNotFound(error)) return null;
    throw error;
  }
}
