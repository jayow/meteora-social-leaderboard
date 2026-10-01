/**
 * Open positions: one module for fetching them from Meteora, merging them across a user's wallets,
 * and reading what the last sync stored. Every place that shows open positions (profile list + the
 * "Open positions" stat, pool pages, the Poolside composer) reads the rows written here, so the
 * count and the list can't come from different sources.
 *
 * Meteora's /portfolio/open groups positions by pool (several positions in one pool = one entry with
 * `openPositionCount`) and paginates by pool (20 per page by default, 50 max).
 */
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { openPositions, type OpenPositionDetail } from "@/lib/db/schema";
import { num } from "@/lib/meteora";
import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { METEORA_OPEN_PAGE_SIZE, meteoraUrls } from "@/lib/meteora-endpoints";

type Json = Record<string, unknown>;

/** A pool entry from Meteora's /portfolio/open (only the fields we use; wallet fields never kept). */
export interface MeteoraOpenPool {
  poolAddress?: string;
  binStep?: string | number;
  tokenX?: string;
  tokenY?: string;
  tokenXMint?: string;
  tokenYMint?: string;
  tokenXIcon?: string;
  tokenYIcon?: string;
  balances?: string | number;
  unclaimedFees?: string | number;
  /** Live PnL of the open positions in this pool (used to pick a top pool). */
  pnl?: string | number;
  openPositionCount?: number;
  listPositions?: unknown[];
}

export interface WalletOpenPositions {
  /** Every pool across all pages. */
  pools: MeteoraOpenPool[];
  /** Meteora's own position total for the wallet (cross-check for the per-pool counts). */
  reportedPositions: number;
}

/** Safety cap: 20 pages x 50 pools = 1000 pools per wallet. */
const MAX_PAGES = 20;

/** Positions in one Meteora pool entry (never less than 1: Meteora only lists pools with an open position). */
export function poolPositionCount(p: MeteoraOpenPool): number {
  const n = Math.round(num(p.openPositionCount));
  if (n > 0) return n;
  return Array.isArray(p.listPositions) && p.listPositions.length > 0 ? p.listPositions.length : 1;
}

/**
 * All open pools for one wallet, following Meteora's pagination. Returns null when any page fails, so
 * callers never mistake a partial answer for "these are all the positions". A 404 means no data = none open.
 */
export async function fetchWalletOpenPositions(wallet: string, ttlMs = 60000): Promise<WalletOpenPositions | null> {
  const pools: MeteoraOpenPool[] = [];
  let reportedPositions = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let data: Json | null;
    try {
      data = await fetchMeteoraOrNull<Json>(meteoraUrls.portfolioOpen(wallet, page, METEORA_OPEN_PAGE_SIZE), ttlMs);
    } catch {
      return null;
    }
    if (data === null) break; // 404: nothing open
    if (typeof data !== "object" || !Array.isArray(data.pools)) return null;
    if (page === 1) {
      const total = (data.total as Json | undefined) ?? {};
      reportedPositions = Math.round(num(data.totalPositions ?? total.totalPositions));
    }
    const pagePools = data.pools as MeteoraOpenPool[];
    pools.push(...pagePools);
    if (!data.hasNext || pagePools.length === 0) break;
    if (page === MAX_PAGES) return null; // more than we're willing to page through: don't store a partial list
  }
  return { pools, reportedPositions };
}

/** A pool the user has open positions in, merged across all their wallets. */
export interface MergedOpenPool extends MeteoraOpenPool {
  poolAddress: string;
  positionCount: number;
  valueUsd: number;
  /** Per-position details; undefined = not fetched this sync (keep what's stored). */
  positions?: OpenPositionDetail[];
}

/* ------------------------------------------------------------------------------------------------ */
/* Per-position details                                                                              */
/* ------------------------------------------------------------------------------------------------ */

/** Pools per user that get per-position details each sync (largest first); keeps syncs cheap. */
export const MAX_DETAIL_POOLS = 30;

function finiteOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function usdOf(v: unknown): number {
  return v && typeof v === "object" ? num((v as Json).usd) : 0;
}

/** Meteora position -> slim public detail. Position and wallet addresses are dropped here. */
function toDetail(p: Json): OpenPositionDetail {
  const u = (p.unrealizedPnl as Json | undefined) ?? {};
  const fees = usdOf(u.unclaimedFeeTokenX) + usdOf(u.unclaimedFeeTokenY);
  return {
    minPrice: finiteOrNull(p.minPrice),
    maxPrice: finiteOrNull(p.maxPrice),
    inRange: p.isOutOfRange !== true,
    valueUsd: num(u.balances) + fees,
    unclaimedFeesUsd: fees,
    pnlUsd: finiteOrNull(p.pnlUsd),
    // Meteora sends percent units (-0.06 = -0.06%); store a fraction like the rest of the app.
    pnlPct: ((v) => (v == null ? null : v / 100))(finiteOrNull(p.pnlPctChange)),
    openedAt: finiteOrNull(p.createdAt),
  };
}

/** One wallet's open positions in one pool, or null if any page failed. */
export async function fetchPoolPositionDetails(poolAddress: string, wallet: string, ttlMs = 60000): Promise<OpenPositionDetail[] | null> {
  const out: OpenPositionDetail[] = [];
  for (let page = 1; page <= 5; page++) {
    let data: Json | null;
    try {
      data = await fetchMeteoraOrNull<Json>(meteoraUrls.poolPositions(poolAddress, wallet, "open", page, 100), ttlMs);
    } catch {
      return null;
    }
    if (data === null) break;
    if (typeof data !== "object" || !Array.isArray(data.positions)) return null;
    for (const p of data.positions as Json[]) if (p && typeof p === "object" && p.isClosed !== true) out.push(toDetail(p));
    if (!data.hasNext) break;
    if (page === 5) return null;
  }
  return out;
}

/**
 * Fill `positions` on the largest merged pools from every wallet holding them. A pool whose details
 * can't all be fetched is left undefined, so the sync keeps what was stored before.
 */
export async function attachPositionDetails(perWallet: { wallet: string; pools: MeteoraOpenPool[] }[], merged: MergedOpenPool[]): Promise<void> {
  await Promise.all(
    merged.slice(0, MAX_DETAIL_POOLS).map(async (pool) => {
      const holders = perWallet.filter((w) => w.pools.some((p) => p.poolAddress === pool.poolAddress));
      const lists = await Promise.all(holders.map((w) => fetchPoolPositionDetails(pool.poolAddress, w.wallet)));
      if (lists.some((l) => l === null)) return;
      pool.positions = (lists as OpenPositionDetail[][]).flat().sort((a, b) => b.valueUsd - a.valueUsd);
    })
  );
}

/** Merge pools across wallets by address: values and position counts add up. */
export function mergeOpenPools(perWallet: MeteoraOpenPool[][]): MergedOpenPool[] {
  const byAddress = new Map<string, MergedOpenPool>();
  for (const pools of perWallet) {
    for (const p of pools) {
      if (!p.poolAddress) continue;
      const count = poolPositionCount(p);
      const value = num(p.balances) + num(p.unclaimedFees);
      const existing = byAddress.get(p.poolAddress);
      if (existing) {
        existing.positionCount += count;
        existing.valueUsd += value;
        existing.balances = num(existing.balances) + num(p.balances);
        existing.unclaimedFees = num(existing.unclaimedFees) + num(p.unclaimedFees);
        existing.pnl = num(existing.pnl) + num(p.pnl);
        existing.tokenXMint ||= p.tokenXMint;
        existing.tokenYMint ||= p.tokenYMint;
        existing.tokenXIcon ||= p.tokenXIcon;
        existing.tokenYIcon ||= p.tokenYIcon;
      } else {
        // Copy only pool fields: no wallet/owner/position addresses are carried forward.
        byAddress.set(p.poolAddress, {
          poolAddress: p.poolAddress,
          binStep: p.binStep,
          tokenX: p.tokenX,
          tokenY: p.tokenY,
          tokenXMint: p.tokenXMint,
          tokenYMint: p.tokenYMint,
          tokenXIcon: p.tokenXIcon,
          tokenYIcon: p.tokenYIcon,
          balances: num(p.balances),
          unclaimedFees: num(p.unclaimedFees),
          pnl: num(p.pnl),
          openPositionCount: count,
          positionCount: count,
          valueUsd: value,
        });
      }
    }
  }
  return [...byAddress.values()].sort((a, b) => b.valueUsd - a.valueUsd);
}

/* ------------------------------------------------------------------------------------------------ */
/* Read side                                                                                         */
/* ------------------------------------------------------------------------------------------------ */

export interface OpenPositionPool {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenYMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  protocol: string | null;
  valueUsd: number | null;
  /** Open positions in this pool (several positions in one pool are one row). */
  positionCount: number;
  /** Per-position details from the last sync that fetched them; null when not available. */
  positions: OpenPositionDetail[] | null;
}

export interface OpenPositionsSummary {
  pools: OpenPositionPool[];
  /** Sum of positionCount: the number shown as "Open positions" everywhere. */
  totalPositions: number;
  poolCount: number;
  totalValueUsd: number;
  /** When the last sync wrote these rows (ISO), null when nothing is stored. */
  syncedAt: string | null;
}

/** What the last sync stored for a user: the single source for the list and its count. */
export async function readOpenPositions(userId: number): Promise<OpenPositionsSummary> {
  const rows = await getDb()
    .select()
    .from(openPositions)
    .where(eq(openPositions.userId, userId))
    .orderBy(desc(openPositions.valueUsd), asc(openPositions.id));
  const pools: OpenPositionPool[] = rows.map((r) => ({
    poolAddress: r.poolAddress,
    tokenX: r.tokenX,
    tokenY: r.tokenY,
    tokenXMint: r.tokenXMint,
    tokenYMint: r.tokenYMint,
    tokenXIcon: r.tokenXIcon,
    tokenYIcon: r.tokenYIcon,
    binStep: r.binStep,
    protocol: r.protocol,
    valueUsd: r.valueUsd,
    positionCount: Math.max(1, r.positionCount ?? 1),
    positions: Array.isArray(r.positions) ? r.positions : null,
  }));
  const syncedAt = rows.reduce<Date | null>((max, r) => (!max || r.updatedAt > max ? r.updatedAt : max), null);
  return {
    pools,
    totalPositions: pools.reduce((s, p) => s + p.positionCount, 0),
    poolCount: pools.length,
    totalValueUsd: pools.reduce((s, p) => s + (p.valueUsd ?? 0), 0),
    syncedAt: syncedAt ? syncedAt.toISOString() : null,
  };
}
