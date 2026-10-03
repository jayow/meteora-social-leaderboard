import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";
import { getUserWalletAddresses } from "@/lib/users";
import type { UserRow } from "@/lib/db/schema";
import { readStoredClosed, readStoredClosedPool } from "@/lib/closed-history";

/**
 * A member's positions closed in the last 30 days, live from Meteora (nothing stored), across all their
 * wallets, in batches so heavy wallets (dozens of pools) stay cheap. Meteora's per-pool portfolio totals cover every closed position in the pool, so the windowed
 * numbers are summed here from each closed position's closedAt. No wallet or position addresses leave
 * this module.
 */

export const CLOSED_WINDOW_DAYS = 30;
/** Pools per batch: exact numbers need one Meteora call per pool, so heavy wallets load in pages. */
export const CLOSED_BATCH = 10;
const MAX_LIST_PAGES = 10;
const MAX_POSITION_PAGES = 3;
const CACHE_MS = 10 * 60_000;

type Json = Record<string, unknown>;

export interface ClosedPosition {
  minPrice: number | null;
  maxPrice: number | null;
  /** Unix seconds. */
  openedAt: number | null;
  closedAt: number;
  capitalUsd: number;
  feesUsd: number;
  pnlUsd: number;
  /** Fraction (0.01 = 1%). */
  pnlPct: number | null;
}

export interface ClosedPool {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenYMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  /** Totals over the positions closed in the window. */
  capitalUsd: number;
  feesUsd: number;
  pnlUsd: number;
  pnlPct: number | null;
  /** Unix seconds: the latest close in the window. */
  lastClosedAt: number;
  positionCount: number;
  /** Per-position detail (live reads only; stored reads leave it empty). */
  positions: ClosedPosition[];
}

export interface ClosedPositionsPage {
  /** This batch, with exact windowed numbers. */
  pools: ClosedPool[];
  /** Every pool with a close in the window (all wallets). */
  totalPools: number;
  /** Offset of the next batch, or null when this was the last. */
  nextOffset: number | null;
  windowDays: number;
  /** Total PnL over every pool in the window; null when only part of it is known (live reads). */
  pnlUsd: number | null;
}

type ClosedUser = Pick<UserRow, "id" | "wallet" | "closedBackfillAt">;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const usd = (v: unknown): number => num((v as Json | undefined)?.usd) ?? 0;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

interface PoolMeta {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenYMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  /** Unix seconds (Meteora's latest close in the pool; inside the window for listed pools). */
  lastClosedAt: number;
}

/** Pools one wallet closed a position in, within the window (pool metadata only; totals are all-time). */
async function closedPoolsFor(wallet: string): Promise<PoolMeta[]> {
  const out: PoolMeta[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page++) {
    const data = await fetchMeteoraOrNull<Json>(meteoraUrls.portfolioClosed(wallet, CLOSED_WINDOW_DAYS, page), CACHE_MS);
    const pools = Array.isArray(data?.pools) ? (data.pools as Json[]) : [];
    for (const p of pools) {
      const poolAddress = str(p.poolAddress);
      if (!poolAddress) continue;
      out.push({
        poolAddress,
        tokenX: str(p.tokenX) ?? "?",
        tokenY: str(p.tokenY) ?? "?",
        tokenXMint: str(p.tokenXMint),
        tokenYMint: str(p.tokenYMint),
        tokenXIcon: str(p.tokenXIcon),
        tokenYIcon: str(p.tokenYIcon),
        binStep: ((n) => (n == null ? null : Math.round(n)))(num(p.binStep)),
        lastClosedAt: num(p.lastClosedAt) ?? 0,
      });
    }
    if (data?.hasNext !== true) break;
  }
  return out;
}

/** One wallet's positions in one pool that closed within the window. */
async function closedPositionsIn(poolAddress: string, wallet: string, since: number): Promise<ClosedPosition[]> {
  const out: ClosedPosition[] = [];
  for (let page = 1; page <= MAX_POSITION_PAGES; page++) {
    const data = await fetchMeteoraOrNull<Json>(meteoraUrls.poolPositions(poolAddress, wallet, "closed", page, 100), CACHE_MS);
    const list = Array.isArray(data?.positions) ? (data.positions as Json[]) : [];
    for (const p of list) {
      const closedAt = num(p.closedAt);
      if (closedAt == null || closedAt < since) continue;
      const capitalUsd = usd((p.allTimeDeposits as Json | undefined)?.total);
      const pnlUsd = num(p.pnlUsd) ?? 0;
      out.push({
        minPrice: num(p.minPrice),
        maxPrice: num(p.maxPrice),
        openedAt: num(p.createdAt),
        closedAt,
        capitalUsd,
        feesUsd: usd((p.allTimeFees as Json | undefined)?.total),
        pnlUsd,
        pnlPct: capitalUsd > 0 ? pnlUsd / capitalUsd : null,
      });
    }
    if (data?.hasNext !== true) break;
  }
  return out;
}

interface ListedPool extends PoolMeta {
  wallets: string[];
}

/** Every pool any of the member's wallets closed a position in during the window, newest close first. */
async function fetchPoolList(user: Pick<UserRow, "id" | "wallet">): Promise<ListedPool[]> {
  const wallets = await getUserWalletAddresses(user);
  const lists = await Promise.all(wallets.map((w) => closedPoolsFor(w)));
  const byPool = new Map<string, ListedPool>();
  lists.forEach((pools, i) => {
    for (const meta of pools) {
      const entry = byPool.get(meta.poolAddress);
      if (entry) {
        entry.wallets.push(wallets[i]);
        entry.lastClosedAt = Math.max(entry.lastClosedAt, meta.lastClosedAt);
      } else byPool.set(meta.poolAddress, { ...meta, wallets: [wallets[i]] });
    }
  });
  return [...byPool.values()].sort((a, b) => b.lastClosedAt - a.lastClosedAt);
}

const listCache = new Map<number, { at: number; value: Promise<ListedPool[]> }>();

function poolList(user: Pick<UserRow, "id" | "wallet">): Promise<ListedPool[]> {
  const hit = listCache.get(user.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  if (listCache.size > 500) listCache.clear();
  const value = fetchPoolList(user);
  listCache.set(user.id, { at: Date.now(), value });
  value.catch(() => listCache.delete(user.id));
  return value;
}

/** Exact windowed numbers for one listed pool (its positions across the wallets that used it). */
async function poolDetail(p: ListedPool): Promise<ClosedPool | null> {
  const since = Math.floor(Date.now() / 1000) - CLOSED_WINDOW_DAYS * 86400;
  const positions = (await Promise.all(p.wallets.map((w) => closedPositionsIn(p.poolAddress, w, since)))).flat();
  if (positions.length === 0) return null;
  positions.sort((a, b) => b.closedAt - a.closedAt);
  const capitalUsd = positions.reduce((s, x) => s + x.capitalUsd, 0);
  const pnlUsd = positions.reduce((s, x) => s + x.pnlUsd, 0);
  return {
    poolAddress: p.poolAddress,
    tokenX: p.tokenX,
    tokenY: p.tokenY,
    tokenXMint: p.tokenXMint,
    tokenYMint: p.tokenYMint,
    tokenXIcon: p.tokenXIcon,
    tokenYIcon: p.tokenYIcon,
    binStep: p.binStep,
    capitalUsd,
    feesUsd: positions.reduce((s, x) => s + x.feesUsd, 0),
    pnlUsd,
    pnlPct: capitalUsd > 0 ? pnlUsd / capitalUsd : null,
    lastClosedAt: positions[0].closedAt,
    positionCount: positions.length,
    positions,
  };
}

/**
 * One batch of the member's closed pools (newest first) with exact numbers. The pool list costs 1-2
 * Meteora calls per wallet; each pool in the batch costs one more (cached 10 minutes by URL).
 */
export async function readClosedPositions(user: ClosedUser, offset = 0, limit = CLOSED_BATCH): Promise<ClosedPositionsPage> {
  // Backfilled members read their stored history: instant, exact totals, no Meteora calls.
  if (user.closedBackfillAt) {
    const stored = await readStoredClosed(user.id, CLOSED_WINDOW_DAYS, offset, limit);
    const next = offset + stored.pools.length;
    return {
      pools: stored.pools,
      totalPools: stored.totalPools,
      nextOffset: next < stored.totalPools ? next : null,
      windowDays: CLOSED_WINDOW_DAYS,
      pnlUsd: stored.pnlUsd,
    };
  }
  const list = await poolList(user);
  const slice = list.slice(offset, offset + limit);
  const pools = (await Promise.all(slice.map(poolDetail))).filter((p): p is ClosedPool => p !== null);
  const next = offset + slice.length;
  return { pools, totalPools: list.length, nextOffset: next < list.length ? next : null, windowDays: CLOSED_WINDOW_DAYS, pnlUsd: null };
}

/** One pool's closed result in the window (share card), or null when it has none. */
export async function readClosedPool(user: ClosedUser, poolAddress: string): Promise<ClosedPool | null> {
  if (user.closedBackfillAt) return readStoredClosedPool(user.id, CLOSED_WINDOW_DAYS, poolAddress);
  const entry = (await poolList(user)).find((p) => p.poolAddress === poolAddress);
  return entry ? poolDetail(entry) : null;
}
