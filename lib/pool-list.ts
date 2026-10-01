/** Row shape shared by /api/pools, /api/tokens/[mint] and the /pools page (only what a row renders). */
export interface PoolListRow {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenYMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  protocol: string | null;
  /** Joined Pool Party members with an open position in the pool. */
  lpCount: number;
  /** USD value of those members' positions. */
  memberLiquidity: number | null;
  /** Pool TVL from Meteora (null if Meteora is unavailable). */
  tvl: number | null;
  /** 24h volume from Meteora (null if Meteora is unavailable). */
  volume24h: number | null;
}

export type PoolSort = "members" | "tvl" | "volume" | "liquidity";

export const POOL_SORTS: ReadonlyArray<{ value: PoolSort; label: string }> = [
  { value: "members", label: "Members" },
  { value: "tvl", label: "TVL" },
  { value: "volume", label: "24h volume" },
  { value: "liquidity", label: "Member liquidity" },
];

export function isPoolSort(v: string | null | undefined): v is PoolSort {
  return v === "members" || v === "tvl" || v === "volume" || v === "liquidity";
}

const n = (v: number | null): number => (v == null || !Number.isFinite(v) ? -Infinity : v);

/** Members first (then TVL) by default; ties broken by TVL then address for stable paging. */
export function comparePoolRows(sort: PoolSort): (a: PoolListRow, b: PoolListRow) => number {
  const tie = (a: PoolListRow, b: PoolListRow): number =>
    n(b.tvl) - n(a.tvl) || (a.poolAddress < b.poolAddress ? -1 : a.poolAddress > b.poolAddress ? 1 : 0);
  switch (sort) {
    case "tvl":
      return (a, b) => n(b.tvl) - n(a.tvl) || b.lpCount - a.lpCount || tie(a, b);
    case "volume":
      return (a, b) => n(b.volume24h) - n(a.volume24h) || tie(a, b);
    case "liquidity":
      return (a, b) => n(b.memberLiquidity) - n(a.memberLiquidity) || b.lpCount - a.lpCount || tie(a, b);
    case "members":
    default:
      return (a, b) => b.lpCount - a.lpCount || tie(a, b);
  }
}

/** Case-insensitive match on either symbol, either mint, or the pool address. */
export function matchesPoolQuery(row: PoolListRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [row.tokenX, row.tokenY, `${row.tokenX}-${row.tokenY}`, row.tokenXMint, row.tokenYMint, row.poolAddress].some(
    (v) => typeof v === "string" && v.toLowerCase().includes(needle)
  );
}

/** GET /api/tokens/:mint */
export interface TokenSummary {
  mint: string;
  symbol: string;
  icon: string | null;
  poolCount: number;
  totalTvl: number;
  memberLiquidity: number;
  lpCount: number;
}

export interface TokenPoolsResponse {
  token: TokenSummary | null;
  pools: PoolListRow[];
  /** Pools matching `q` (all pools when no query). */
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  /** "meteora" = all of the token's pools; "members" = Meteora unavailable, member-held pools only. */
  source: "meteora" | "members";
}

