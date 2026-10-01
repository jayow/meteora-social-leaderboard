import { fetchMeteora, meteoraCache } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";

export interface EnrichedPool {
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
  apr: number | null;
  memberCount: number;
}

/** dlmm.datapi.meteora.ag GET /pools response (fields we use). */
interface MeteoraPoolsDatapiResponse {
  total: number;
  pages: number;
  current_page: number;
  page_size: number;
  data: MeteoraDatapiPool[];
}

interface MeteoraDatapiPool {
  address: string;
  name: string;
  token_x: { address: string; symbol: string };
  token_y: { address: string; symbol: string };
  pool_config?: { bin_step?: number };
  tvl?: number;
  apr?: number;
  volume?: Record<string, number>;
  fees?: Record<string, number>;
  is_blacklisted?: boolean;
}

const PAGE_SIZE = 1000; // Meteora max
// Safety cap: 10 pages x 1000 = 10k pools (SOL, the biggest base token, has ~4k). Pages go through
// the shared 4 rps limiter, so a cold SOL load costs 5 requests (~1.5s); results are cached.
const MAX_PAGES = 10;
const CACHE_TTL_MS = 5 * 60_000;
const PARTIAL_CACHE_TTL_MS = 30_000;

const inflight = new Map<string, Promise<EnrichedPool[]>>();

function toEnriched(pool: MeteoraDatapiPool): EnrichedPool {
  return {
    poolAddress: pool.address,
    tokenX: pool.token_x.symbol,
    tokenY: pool.token_y.symbol,
    tokenXMint: pool.token_x.address,
    tokenYMint: pool.token_y.address,
    tokenXIcon: null,
    tokenYIcon: null,
    binStep: pool.pool_config?.bin_step ?? null,
    protocol: "dlmm",
    tvl: pool.tvl ?? null,
    volume24h: pool.volume?.["24h"] ?? null,
    fees24h: pool.fees?.["24h"] ?? null,
    apr: pool.apr ?? null,
    memberCount: 0,
  };
}

async function loadAllPools(tokenMint: string): Promise<{ pools: EnrichedPool[]; complete: boolean }> {
  // Raw pages are large (~2-3 KB per pool); don't keep them in the URL cache (ttl 0), cache the mapped list.
  const first = await fetchMeteora<MeteoraPoolsDatapiResponse>(meteoraUrls.poolsByBaseToken(tokenMint, 1, PAGE_SIZE), 0);
  const pages = Math.min(Math.max(first.pages || 1, 1), MAX_PAGES);
  let complete = (first.pages || 1) <= MAX_PAGES;

  const rest = await Promise.allSettled(
    Array.from({ length: pages - 1 }, (_, i) =>
      fetchMeteora<MeteoraPoolsDatapiResponse>(meteoraUrls.poolsByBaseToken(tokenMint, i + 2, PAGE_SIZE), 0)
    )
  );

  const byAddress = new Map<string, EnrichedPool>();
  const add = (resp: MeteoraPoolsDatapiResponse): void => {
    if (!Array.isArray(resp?.data)) return;
    for (const pool of resp.data) {
      // The filter already does this; keep a guard in case Meteora changes semantics again.
      if (pool.token_x?.address !== tokenMint || pool.is_blacklisted) continue;
      if (!byAddress.has(pool.address)) byAddress.set(pool.address, toEnriched(pool));
    }
  };
  add(first);
  for (const r of rest) {
    if (r.status === "fulfilled") add(r.value);
    else {
      complete = false;
      console.error(`[meteora-pools] page fetch failed for ${tokenMint}:`, r.reason);
    }
  }
  return { pools: Array.from(byAddress.values()), complete };
}

/**
 * Fetch ALL non-blacklisted Meteora DLMM pools that have `tokenMint` as base token (token_x),
 * sorted by TVL desc. Paginates Meteora's /pools with `filter_by=token_x=<mint>`; cached 5 min.
 * Returns [] if Meteora is unavailable (callers fall back to member-held pools).
 */
export async function fetchMeteoraPoolsForToken(tokenMint: string): Promise<EnrichedPool[]> {
  const cacheKey = `pools-for-token:${tokenMint}`;
  const cached = meteoraCache.get(cacheKey);
  if (Array.isArray(cached)) return cached as EnrichedPool[];

  let pending = inflight.get(tokenMint);
  if (!pending) {
    pending = loadAllPools(tokenMint)
      .then(({ pools, complete }) => {
        meteoraCache.set(cacheKey, pools, complete ? CACHE_TTL_MS : PARTIAL_CACHE_TTL_MS);
        return pools;
      })
      .finally(() => inflight.delete(tokenMint));
    inflight.set(tokenMint, pending);
  }

  try {
    return await pending;
  } catch (error) {
    console.error("Error fetching Meteora pools:", error);
    return [];
  }
}
