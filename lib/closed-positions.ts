import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";
import { getUserWalletAddresses } from "@/lib/users";
import type { UserRow } from "@/lib/db/schema";

/**
 * A member's positions closed in the last 30 days, live from Meteora (nothing stored), across all their
 * wallets. Meteora's per-pool portfolio totals cover every closed position in the pool, so the windowed
 * numbers are summed here from each closed position's closedAt. No wallet or position addresses leave
 * this module.
 */

export const CLOSED_WINDOW_DAYS = 30;
const MAX_POOLS = 25;
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
  positions: ClosedPosition[];
}

export interface ClosedPositionsSummary {
  pools: ClosedPool[];
  positionCount: number;
  pnlUsd: number;
  windowDays: number;
  fetchedAt: string;
}

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
}

/** Pools one wallet closed a position in, within the window (pool metadata only; totals are all-time). */
async function closedPoolsFor(wallet: string): Promise<PoolMeta[]> {
  const out: PoolMeta[] = [];
  for (let page = 1; page <= 2 && out.length < MAX_POOLS; page++) {
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
      });
    }
    if (data?.hasNext !== true) break;
  }
  return out.slice(0, MAX_POOLS);
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

async function fetchClosed(user: Pick<UserRow, "id" | "wallet">): Promise<ClosedPositionsSummary> {
  const since = Math.floor(Date.now() / 1000) - CLOSED_WINDOW_DAYS * 86400;
  const wallets = await getUserWalletAddresses(user);
  const byPool = new Map<string, PoolMeta & { positions: ClosedPosition[] }>();
  for (const wallet of wallets) {
    const pools = await closedPoolsFor(wallet);
    const lists = await Promise.all(pools.map((p) => closedPositionsIn(p.poolAddress, wallet, since)));
    pools.forEach((meta, i) => {
      const entry = byPool.get(meta.poolAddress) ?? { ...meta, positions: [] };
      entry.positions.push(...lists[i]);
      byPool.set(meta.poolAddress, entry);
    });
  }

  const pools: ClosedPool[] = [];
  for (const p of byPool.values()) {
    if (p.positions.length === 0) continue;
    p.positions.sort((a, b) => b.closedAt - a.closedAt);
    const capitalUsd = p.positions.reduce((s, x) => s + x.capitalUsd, 0);
    const pnlUsd = p.positions.reduce((s, x) => s + x.pnlUsd, 0);
    pools.push({
      ...p,
      capitalUsd,
      feesUsd: p.positions.reduce((s, x) => s + x.feesUsd, 0),
      pnlUsd,
      pnlPct: capitalUsd > 0 ? pnlUsd / capitalUsd : null,
      lastClosedAt: p.positions[0].closedAt,
    });
  }
  pools.sort((a, b) => b.lastClosedAt - a.lastClosedAt);
  return {
    pools,
    positionCount: pools.reduce((s, p) => s + p.positions.length, 0),
    pnlUsd: pools.reduce((s, p) => s + p.pnlUsd, 0),
    windowDays: CLOSED_WINDOW_DAYS,
    fetchedAt: new Date().toISOString(),
  };
}

const cache = new Map<number, { at: number; value: Promise<ClosedPositionsSummary> }>();

/** Cached 10 minutes per member; concurrent requests share one fetch. */
export function readClosedPositions(user: Pick<UserRow, "id" | "wallet">): Promise<ClosedPositionsSummary> {
  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  if (cache.size > 500) cache.clear();
  const value = fetchClosed(user);
  cache.set(user.id, { at: Date.now(), value });
  value.catch(() => cache.delete(user.id));
  return value;
}
