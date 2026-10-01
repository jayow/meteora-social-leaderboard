/**
 * Single source of truth for Meteora datapi URLs. lib/sync.ts and the /api/users/:id/* routes
 * build their URLs here so they can't drift onto endpoints that don't exist.
 * Docs: https://dlmm.datapi.meteora.ag/swagger-ui , https://portfolio.datapi.meteora.ag
 */

export const METEORA_DLMM_API = "https://dlmm.datapi.meteora.ag";
export const METEORA_PORTFOLIO_API = "https://portfolio.datapi.meteora.ag";
/** Pool discovery API: what app.meteora.ag uses for pool lists/search (smaller records, token icons). */
export const METEORA_POOL_DISCOVERY_API = "https://pool-discovery-api.datapi.meteora.ag";

export type MeteoraTimeRange = "7d" | "30d" | "all";

export const METEORA_TIME_RANGES: readonly MeteoraTimeRange[] = ["7d", "30d", "all"];

export function isMeteoraTimeRange(v: string): v is MeteoraTimeRange {
  return (METEORA_TIME_RANGES as readonly string[]).includes(v);
}

const enc = encodeURIComponent;

/** Max page size Meteora allows on /portfolio/open. */
export const METEORA_OPEN_PAGE_SIZE = 50;

export const meteoraUrls = {
  /** All-time totals: { totalPnlUsd, totalPnlSol, totalPnlPctChange, totalPnlSolPctChange, totalClosedPositions } */
  portfolioTotal: (wallet: string): string => `${METEORA_DLMM_API}/portfolio/total?user=${enc(wallet)}`,
  /**
   * Open positions grouped by pool. Paginated by POOL: `page` is 1-based, `pageSize` max 50
   * (Meteora's default is 20). `totalPositions` / `total` in the response cover every page.
   */
  portfolioOpen: (wallet: string, page = 1, pageSize = METEORA_OPEN_PAGE_SIZE): string =>
    `${METEORA_DLMM_API}/portfolio/open?user=${enc(wallet)}&page=${page}&page_size=${pageSize}`,
  /**
   * One wallet's positions in one pool with per-position range, value, fees and PnL.
   * `status` open | closed | all; `pageSize` max 100.
   */
  poolPositions: (poolAddress: string, wallet: string, status: "open" | "closed" | "all" = "open", page = 1, pageSize = 100): string =>
    `${METEORA_DLMM_API}/positions/${enc(poolAddress)}/pnl?user=${enc(wallet)}&status=${status}&page=${page}&page_size=${pageSize}`,
  /** Closed + open pools history. */
  portfolio: (wallet: string, pageSize = 100): string =>
    `${METEORA_DLMM_API}/portfolio?user=${enc(wallet)}&page_size=${pageSize}`,
  /** Windowed performance (snake_case: pnl_usd, win_rate_usd, total_deposit_usd, ...). */
  performance: (wallet: string, range: MeteoraTimeRange): string =>
    `${METEORA_PORTFOLIO_API}/performances/${enc(wallet)}?time_range=${range}`,
  /** Daily PnL calendar for a month (YYYY-MM). */
  calendar: (wallet: string, month: string): string =>
    `${METEORA_PORTFOLIO_API}/chart/calendar/${enc(wallet)}?month=${enc(month)}`,
  /** Single DLMM pool. */
  pool: (address: string): string => `${METEORA_DLMM_API}/pools/${enc(address)}`,
  /**
   * DLMM pools whose base token (token_x) is `mint`, excluding blacklisted pools: the same set
   * Meteora's app shows. (`/pools?mint=` is not a real filter; Meteora ignores it.)
   * `page` is 1-based, `pageSize` max 1000.
   */
  poolsByBaseToken: (mint: string, page: number, pageSize: number): string =>
    `${METEORA_DLMM_API}/pools?filter_by=${enc(`token_x=${mint} && is_blacklisted=false`)}` +
    `&sort_by=${enc("tvl:desc")}&page=${page}&page_size=${pageSize}`,
  /**
   * Pool discovery search: non-blacklisted DLMM pools with base token (token_x) `mint`, TVL desc.
   * Cursor-paginated: pass the previous response's `after_key`. `pageSize` max 1000.
   * (Multi-value filters use commas inside [...]; the documented `|` separator returns nothing.)
   */
  poolSearchByBaseToken: (mint: string, pageSize: number, afterKey?: string | null): string =>
    `${METEORA_POOL_DISCOVERY_API}/search?filter_by=${enc(`is_blacklisted=false && pool_type=dlmm && token_x=[${mint}]`)}` +
    `&sort_by=${enc("tvl:desc")}&page_size=${pageSize}` +
    (afterKey ? `&after_key=${enc(afterKey)}` : ""),
  /** Pool discovery search for specific pools (any type, incl. blacklisted). Keep to <= 100 addresses. */
  poolSearchByAddresses: (addresses: readonly string[]): string =>
    `${METEORA_POOL_DISCOVERY_API}/search?filter_by=${enc(`pool_address=[${addresses.join(",")}]`)}` +
    `&page_size=${Math.max(addresses.length, 1)}`,
} as const;
