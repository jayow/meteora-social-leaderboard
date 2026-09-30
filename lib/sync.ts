import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pnlSnapshots, users, type NewSnapshot, type UserRow } from "@/lib/db/schema";
import { num } from "@/lib/meteora";

const DLMM = "https://dlmm.datapi.meteora.ag";
const PORTFOLIO = "https://portfolio.datapi.meteora.ag";

type Json = Record<string, unknown>;

const KNOWN_ICONS: Record<string, string> = {
  So11111111111111111111111111111111111111112:
    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v:
    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB:
    "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg",
};

function mintOf(t: unknown): string {
  return t && typeof t === "object" && typeof (t as Json).address === "string" ? ((t as Json).address as string) : "";
}

async function getJson(url: string): Promise<Json | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return data && typeof data === "object" ? (data as Json) : null;
  } catch {
    return null;
  }
}

interface PortfolioPool {
  poolAddress?: string;
  binStep?: string | number;
  tokenX?: string;
  tokenY?: string;
  tokenXIcon?: string;
  tokenYIcon?: string;
  pnlUsd?: string | number;
  pnl?: string | number;
  lastClosedAt?: number;
}

interface TopPool {
  address: string;
  name: string;
  binStep: number | null;
  protocol: string;
  xIcon: string | null;
  yIcon: string | null;
}

function asPools(v: unknown): PortfolioPool[] {
  return Array.isArray(v) ? (v as PortfolioPool[]) : [];
}

async function resolveTopPool(perf30: Json | null, pools: PortfolioPool[], openPools: PortfolioPool[]): Promise<TopPool | null> {
  const all = [...openPools, ...pools];
  const byAddr = new Map<string, PortfolioPool>();
  for (const p of all) if (p.poolAddress && !byAddr.has(p.poolAddress)) byAddr.set(p.poolAddress, p);

  const fromPortfolio = (p: PortfolioPool): TopPool => ({
    address: p.poolAddress || "",
    name: `${p.tokenX || "?"}-${p.tokenY || "?"}`,
    binStep: p.binStep != null ? Math.round(num(p.binStep)) : null,
    protocol: "dlmm",
    xIcon: p.tokenXIcon || null,
    yIcon: p.tokenYIcon || null,
  });

  // 1) The pool behind the biggest 30D win, if it's a DLMM pool.
  const dlmm = perf30?.dlmm as Json | undefined;
  const bigPool = typeof dlmm?.biggest_pnl_usd_pool === "string" ? dlmm.biggest_pnl_usd_pool : null;
  if (bigPool) {
    const known = byAddr.get(bigPool);
    if (known) return fromPortfolio(known);
    const info = await getJson(`${DLMM}/pools/${bigPool}`);
    if (info && typeof info.name === "string") {
      const cfg = info.pool_config as Json | undefined;
      return {
        address: bigPool,
        name: info.name,
        binStep: cfg?.bin_step != null ? Math.round(num(cfg.bin_step)) : null,
        protocol: "dlmm",
        xIcon: KNOWN_ICONS[mintOf(info.token_x)] || null,
        yIcon: KNOWN_ICONS[mintOf(info.token_y)] || null,
      };
    }
  }

  // 2) Otherwise the best-performing pool among recent/open pools.
  const cutoff = Date.now() / 1000 - 30 * 86400;
  const recent = pools.filter((p) => (p.lastClosedAt || 0) >= cutoff);
  const candidates = [...openPools, ...(recent.length ? recent : pools)];
  let best: PortfolioPool | null = null;
  let bestPnl = -Infinity;
  for (const p of candidates) {
    const v = num(p.pnlUsd ?? p.pnl);
    if (v > bestPnl) {
      bestPnl = v;
      best = p;
    }
  }
  return best && best.poolAddress ? fromPortfolio(best) : null;
}

export interface SyncResult {
  ok: boolean;
  wallet: string;
  date: string;
  snapshot?: NewSnapshot;
  error?: string;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Pull Meteora totals + 7d/30d/all performance for a wallet and upsert today's snapshot. */
export async function syncUser(user: UserRow): Promise<SyncResult> {
  const w = encodeURIComponent(user.wallet);
  const [total, open, portfolio, perf7, perf30, perfAll] = await Promise.all([
    getJson(`${DLMM}/portfolio/total?user=${w}`),
    getJson(`${DLMM}/portfolio/open?user=${w}`),
    getJson(`${DLMM}/portfolio?user=${w}&page_size=100`),
    getJson(`${PORTFOLIO}/performances/${w}?time_range=7d`),
    getJson(`${PORTFOLIO}/performances/${w}?time_range=30d`),
    getJson(`${PORTFOLIO}/performances/${w}?time_range=all`),
  ]);

  const date = todayUtc();
  if (!total && !perf30 && !perfAll) {
    return { ok: false, wallet: user.wallet, date, error: "Meteora APIs unavailable" };
  }

  const openTotals = (open?.total as Json | undefined) || {};
  const openPools = asPools(open?.pools);
  const pools = asPools(portfolio?.pools);
  const topPool = await resolveTopPool(perf30, pools, openPools);

  const fees = (p: Json | null) => (p ? num(p.realized_fee_earned_usd) + num(p.unrealized_fee_earned_usd) : null);
  const hasTrades = (p: Json | null) => (p ? num(p.win_count_usd) + num(p.loss_count_usd) > 0 : false);

  const snapshot: NewSnapshot = {
    userId: user.id,
    date,
    // Lifetime DLMM realized PnL (matches Meteora's portfolio "Total PnL").
    totalPnlUsd: total ? num(total.totalPnlUsd) : perfAll ? num(perfAll.pnl_usd) : null,
    pnl7d: perf7 ? num(perf7.pnl_usd) : null,
    pnl30d: perf30 ? num(perf30.pnl_usd) : null,
    // Meteora doesn't expose LP "volume" per wallet; deposits are the closest proxy.
    volumeUsd: perfAll ? num(perfAll.total_deposit_usd) : null,
    volume7dUsd: perf7 ? num(perf7.total_deposit_usd) : null,
    volume30dUsd: perf30 ? num(perf30.total_deposit_usd) : null,
    feesUsd: fees(perfAll),
    fees30dUsd: fees(perf30),
    winRate: hasTrades(perfAll) ? num(perfAll?.win_rate_usd) : null,
    winRate7d: hasTrades(perf7) ? num(perf7?.win_rate_usd) : null,
    winRate30d: hasTrades(perf30) ? num(perf30?.win_rate_usd) : null,
    positionsOpen: open ? Math.round(num(open.totalPositions ?? openTotals.totalPositions)) : null,
    positionsClosed: total ? Math.round(num(total.totalClosedPositions)) : null,
    portfolioValueUsd: open ? num(openTotals.balances) + num(openTotals.unclaimedFees) : null,
    topPoolAddress: topPool?.address || null,
    topPoolName: topPool?.name || null,
    topPoolBinStep: topPool?.binStep ?? null,
    topPoolProtocol: topPool?.protocol || null,
    topPoolXIcon: topPool?.xIcon || null,
    topPoolYIcon: topPool?.yIcon || null,
    source: {
      fetchedAt: new Date().toISOString(),
      total,
      openTotals,
      perf7: perf7 ? stripNested(perf7) : null,
      perf30: perf30 ? stripNested(perf30) : null,
      perfAll: perfAll ? stripNested(perfAll) : null,
    },
  };

  const db = getDb();
  const { userId: _u, date: _d, ...updatable } = snapshot;
  void _u;
  void _d;
  await db
    .insert(pnlSnapshots)
    .values(snapshot)
    .onConflictDoUpdate({
      target: [pnlSnapshots.userId, pnlSnapshots.date],
      set: { ...updatable, updatedAt: sql`now()` },
    });
  await db.update(users).set({ lastSyncedAt: sql`now()` }).where(eq(users.id, user.id));

  return { ok: true, wallet: user.wallet, date, snapshot };
}

function stripNested(p: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(p)) if (v === null || typeof v !== "object") out[k] = v;
  return out;
}

export async function getSnapshot(userId: number, date: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(pnlSnapshots)
    .where(and(eq(pnlSnapshots.userId, userId), eq(pnlSnapshots.date, date)))
    .limit(1);
  return rows[0] || null;
}
