/**
 * Global in-process rate limiter for Meteora datapi.
 * Shared across dlmm.datapi.meteora.ag and portfolio.datapi.meteora.ag.
 * Limit: 300 req/min (~5 req/s), but we target 4 req/s to be safe.
 */

interface RateLimitState {
  remaining: number;
  resetAt: number;
  lastRequest: number;
}

class MeteoraLimiter {
  private state: RateLimitState = {
    remaining: 300,
    resetAt: Date.now() + 60000,
    lastRequest: 0,
  };

  private readonly minDelayMs = 250; // ~4 req/s

  async acquire(): Promise<void> {
    const now = Date.now();

    // Enforce minimum delay between requests
    const timeSinceLastRequest = now - this.state.lastRequest;
    if (timeSinceLastRequest < this.minDelayMs) {
      await this.sleep(this.minDelayMs - timeSinceLastRequest);
    }

    // Check if we're close to rate limit
    if (this.state.remaining < 10 && now < this.state.resetAt) {
      const waitMs = this.state.resetAt - now + 1000; // +1s buffer
      console.log(`[meteora-limiter] Low remaining (${this.state.remaining}), waiting ${waitMs}ms until reset`);
      await this.sleep(waitMs);
      this.state.remaining = 300; // Reset after waiting
    }

    this.state.lastRequest = Date.now();
  }

  updateFromHeaders(headers: Headers): void {
    const remaining = headers.get("x-ratelimit-remaining");
    const reset = headers.get("x-ratelimit-reset");

    if (remaining) {
      this.state.remaining = parseInt(remaining, 10);
    }

    if (reset) {
      const resetSeconds = parseInt(reset, 10);
      this.state.resetAt = resetSeconds * 1000;
    }
  }

  async handleRateLimit(retryAfter?: string): Promise<void> {
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
    console.log(`[meteora-limiter] 429 received, waiting ${waitMs}ms`);
    await this.sleep(waitMs);
    this.state.remaining = 300;
    this.state.resetAt = Date.now() + 60000;
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

export async function fetchMeteora<T = unknown>(url: string, ttlMs = 120000): Promise<T> {
  const cached = meteoraCache.get(url);
  if (cached) {
    return cached as T;
  }

  await meteoraLimiter.acquire();

  let attempt = 0;
  const maxRetries = 3;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      meteoraLimiter.updateFromHeaders(res.headers);

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        await meteoraLimiter.handleRateLimit(retryAfter ?? undefined);
        attempt++;
        continue;
      }

      if (!res.ok) {
        if (res.status >= 500 && attempt < maxRetries - 1) {
          await meteoraLimiter.handleRateLimit();
          attempt++;
          continue;
        }
        throw new Error(`Meteora API error: ${res.status}`);
      }

      const data = await res.json();
      meteoraCache.set(url, data, ttlMs);
      return data as T;
    } catch (error) {
      if (attempt >= maxRetries - 1) throw error;
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }

  throw new Error("Max retries exceeded");
}
