import { fetchMeteora, meteoraCache } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";

/** Meteora market data for one DLMM pool (slim). */
export interface MeteoraPoolStats {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string;
  tokenYMint: string;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  protocol: string;
  tvl: number | null;
  volume24h: number | null;
  fees24h: number | null;
}

/** pool-discovery-api.datapi.meteora.ag GET /search response (fields we use). */
interface PoolSearchResponse {
  total?: number;
  data?: PoolSearchItem[];
  after_key?: string | null;
  has_more?: boolean;
}

interface PoolSearchToken {
  address?: string;
  symbol?: string;
  icon?: string | null;
}

interface PoolSearchItem {
  pool_address: string;
  name?: string;
  pool_type?: string;
  token_x?: PoolSearchToken;
  token_y?: PoolSearchToken;
  dlmm_params?: { bin_step?: number } | null;
  tvl?: number;
  volume_24h?: number;
  fee_24h?: number;
}

function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toStats(p: PoolSearchItem): MeteoraPoolStats {
  const [nameX = "?", nameY = "?"] = (p.name || "").split("-");
  return {
    poolAddress: p.pool_address,
    tokenX: p.token_x?.symbol || nameX,
    tokenY: p.token_y?.symbol || nameY,
    tokenXMint: p.token_x?.address || "",
    tokenYMint: p.token_y?.address || "",
    tokenXIcon: p.token_x?.icon || null,
    tokenYIcon: p.token_y?.icon || null,
    binStep: finite(p.dlmm_params?.bin_step),
    protocol: p.pool_type || "dlmm",
    tvl: finite(p.tvl),
    volume24h: finite(p.volume_24h),
    fees24h: finite(p.fee_24h),
  };
}

// ---------------------------------------------------------------------------------------------
// All pools for a base token (stale-while-revalidate cache)
// ---------------------------------------------------------------------------------------------

const PAGE_SIZE = 1000; // Meteora max
// Safety cap: 10 pages x 1000 = 10k pools (SOL, the biggest base token, has ~4k).
const MAX_PAGES = 10;
const FRESH_MS = 5 * 60_000; // serve without refreshing
const STALE_MS = 60 * 60_000; // serve stale + refresh in the background
const PARTIAL_FRESH_MS = 30_000; // a page failed: retry sooner
const MAX_TOKENS_CACHED = 200;

interface TokenPoolsEntry {
  pools: MeteoraPoolStats[];
  fetchedAt: number;
  freshMs: number;
}

const tokenPools = new Map<string, TokenPoolsEntry>();
const tokenInflight = new Map<string, Promise<TokenPoolsEntry>>();

async function loadAllPools(tokenMint: string): Promise<TokenPoolsEntry> {
  const byAddress = new Map<string, MeteoraPoolStats>();
  let afterKey: string | null = null;
  let complete = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    let resp: PoolSearchResponse;
    try {
      // Raw pages are large; ttl 0 = don't keep them in the URL cache, we cache the slim list.
      resp = await fetchMeteora<PoolSearchResponse>(meteoraUrls.poolSearchByBaseToken(tokenMint, PAGE_SIZE, afterKey), 0);
    } catch (error) {
      if (page === 0) throw error;
      console.error(`[meteora-pools] page ${page + 1} failed for ${tokenMint}:`, error);
      break;
    }
    for (const item of resp.data || []) {
      // The filter already does this; guard in case Meteora changes semantics again.
      if (item.token_x?.address !== tokenMint || (item.pool_type && item.pool_type !== "dlmm")) continue;
      if (!byAddress.has(item.pool_address)) byAddress.set(item.pool_address, toStats(item));
    }
    afterKey = resp.after_key || null;
    if (!resp.has_more || !afterKey) {
      complete = true;
      break;
    }
  }

  return {
    pools: Array.from(byAddress.values()),
    fetchedAt: Date.now(),
    freshMs: complete ? FRESH_MS : PARTIAL_FRESH_MS,
  };
}

function refreshTokenPools(tokenMint: string): Promise<TokenPoolsEntry> {
  let pending = tokenInflight.get(tokenMint);
  if (!pending) {
    pending = loadAllPools(tokenMint)
      .then((entry) => {
        tokenPools.delete(tokenMint);
        tokenPools.set(tokenMint, entry);
        while (tokenPools.size > MAX_TOKENS_CACHED) {
          const oldest = tokenPools.keys().next().value;
          if (oldest === undefined) break;
          tokenPools.delete(oldest);
        }
        return entry;
      })
      .finally(() => tokenInflight.delete(tokenMint));
    tokenInflight.set(tokenMint, pending);
  }
  return pending;
}

/**
 * ALL non-blacklisted Meteora DLMM pools with `tokenMint` as base token (token_x), TVL desc: the same
 * set app.meteora.ag shows. Cursor-paginates pool-discovery /search through the shared 4 rps limiter.
 * Cached 5 min fresh, then served stale (up to 1 h) while refreshing in the background.
 * Returns [] if Meteora is unavailable and nothing is cached (callers fall back to member pools).
 */
export async function fetchMeteoraPoolsForToken(tokenMint: string): Promise<MeteoraPoolStats[]> {
  const entry = tokenPools.get(tokenMint);
  const age = entry ? Date.now() - entry.fetchedAt : Infinity;
  if (entry && age < entry.freshMs) return entry.pools;
  if (entry && age < STALE_MS) {
    refreshTokenPools(tokenMint).catch((error) => console.error("[meteora-pools] background refresh failed:", error));
    return entry.pools;
  }
  try {
    return (await refreshTokenPools(tokenMint)).pools;
  } catch (error) {
    console.error("Error fetching Meteora pools:", error);
    return entry ? entry.pools : [];
  }
}

// ---------------------------------------------------------------------------------------------
// Stats for specific pools (e.g. the member pools on /pools)
// ---------------------------------------------------------------------------------------------

const STATS_TTL_MS = 2 * 60_000;
const STATS_BATCH = 100;
const statsKey = (address: string): string => `pool-stats:${address}`;
const MISSING = "missing";

/** Meteora stats for the given pools, batched (100 per request) and cached per pool for 2 min. */
export async function fetchMeteoraPoolStats(addresses: readonly string[]): Promise<Map<string, MeteoraPoolStats>> {
  const out = new Map<string, MeteoraPoolStats>();
  const todo: string[] = [];
  for (const address of new Set(addresses)) {
    const cached = meteoraCache.get(statsKey(address));
    if (cached === MISSING) continue;
    if (cached && typeof cached === "object") out.set(address, cached as MeteoraPoolStats);
    else todo.push(address);
  }

  const batches: string[][] = [];
  for (let i = 0; i < todo.length; i += STATS_BATCH) batches.push(todo.slice(i, i + STATS_BATCH));

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const resp = await fetchMeteora<PoolSearchResponse>(meteoraUrls.poolSearchByAddresses(batch), 0);
        const found = new Set<string>();
        for (const item of resp.data || []) {
          const stats = toStats(item);
          found.add(stats.poolAddress);
          out.set(stats.poolAddress, stats);
          meteoraCache.set(statsKey(stats.poolAddress), stats, STATS_TTL_MS);
        }
        for (const address of batch) if (!found.has(address)) meteoraCache.set(statsKey(address), MISSING, STATS_TTL_MS);
      } catch (error) {
        console.error("[meteora-pools] pool stats batch failed:", error);
      }
    })
  );
  return out;
}
