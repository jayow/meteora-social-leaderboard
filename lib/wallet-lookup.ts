import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { meteoraUrls, type MeteoraTimeRange } from "@/lib/meteora-endpoints";
import { attachPositionDetails, fetchWalletOpenPositions, mergeOpenPools, type OpenPositionPool } from "@/lib/open-positions";
import { enrichPoolsWithMints } from "@/lib/sync";

/**
 * Look up any Solana wallet's Meteora DLMM stats and open positions, registered or not. Live from
 * Meteora (plus the chain for liquidity shapes); nothing is stored. Deliberately says nothing about
 * Pool Party accounts: whether the wallet belongs to a member is never looked up or returned.
 */

type Range = "1d" | MeteoraTimeRange;
type Json = Record<string, unknown>;

export interface WalletRangeStats {
  pnlUsd: number | null;
  volumeUsd: number | null;
  feesUsd: number | null;
  winRate: number | null;
}

export interface WalletLookup {
  address: string;
  stats: Record<Range, WalletRangeStats>;
  totalPnlUsd: number | null;
  positionsClosed: number | null;
  openValueUsd: number;
  /** Same shape as /api/users/:id/open-positions, so the Open positions view can render it. */
  openPositions: { positions: OpenPositionPool[]; totalPositions: number; poolCount: number };
  fetchedAt: string;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<WalletLookup> }>();

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Same formulas as the member sync (lib/sync.ts) for one wallet. */
function rangeStats(p: Json | null): WalletRangeStats {
  if (!p) return { pnlUsd: null, volumeUsd: null, feesUsd: null, winRate: null };
  const wins = num(p.win_count_usd) ?? 0;
  const losses = num(p.loss_count_usd) ?? 0;
  const fees = (num(p.realized_fee_earned_usd) ?? 0) + (num(p.unrealized_fee_earned_usd) ?? 0);
  return {
    pnlUsd: num(p.pnl_usd),
    volumeUsd: num(p.total_deposit_usd),
    feesUsd: fees,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
  };
}

async function fetchLookup(address: string): Promise<WalletLookup> {
  const get = (url: string) => fetchMeteoraOrNull<Json>(url, CACHE_MS).catch(() => null);
  const [total, open, p1, p7, p30, pAll] = await Promise.all([
    get(meteoraUrls.portfolioTotal(address)),
    fetchWalletOpenPositions(address, CACHE_MS),
    get(meteoraUrls.performance(address, "1d")),
    get(meteoraUrls.performance(address, "7d")),
    get(meteoraUrls.performance(address, "30d")),
    get(meteoraUrls.performance(address, "all")),
  ]);

  const merged = mergeOpenPools([open?.pools ?? []]);
  await enrichPoolsWithMints(merged).catch(() => undefined);
  await attachPositionDetails([{ wallet: address, pools: open?.pools ?? [] }], merged).catch(() => undefined);
  const positions: OpenPositionPool[] = merged.map((p) => ({
    poolAddress: p.poolAddress,
    tokenX: p.tokenX || "?",
    tokenY: p.tokenY || "?",
    tokenXMint: p.tokenXMint || null,
    tokenYMint: p.tokenYMint || null,
    tokenXIcon: p.tokenXIcon || null,
    tokenYIcon: p.tokenYIcon || null,
    binStep: p.binStep != null ? Math.round(Number(p.binStep)) : null,
    protocol: "dlmm",
    valueUsd: p.valueUsd,
    positionCount: Math.max(1, p.positionCount || 1),
    positions: p.positions ?? null,
  }));

  return {
    address,
    stats: { "1d": rangeStats(p1), "7d": rangeStats(p7), "30d": rangeStats(p30), all: rangeStats(pAll) },
    totalPnlUsd: num(total?.totalPnlUsd) ?? num(pAll?.pnl_usd),
    positionsClosed: num(total?.totalClosedPositions),
    openValueUsd: positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0),
    openPositions: {
      positions,
      totalPositions: positions.reduce((s, p) => s + p.positionCount, 0),
      poolCount: positions.length,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** Cached for a minute per wallet, and concurrent lookups of the same wallet share one fetch. */
export function lookupWallet(address: string): Promise<WalletLookup> {
  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  if (cache.size > 500) cache.clear();
  const value = fetchLookup(address);
  cache.set(address, { at: Date.now(), value });
  value.catch(() => cache.delete(address));
  return value;
}
