import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { openPositions, pnlSnapshots, users, type NewSnapshot, type UserRow } from "@/lib/db/schema";
import { num } from "@/lib/meteora";
import { fetchMeteora } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";
import { getUserWalletAddresses } from "@/lib/users";
import { recordSyncActivity, type SyncedPosition } from "@/lib/activity";
import { attachPositionDetails, fetchWalletOpenPositions, mergeOpenPools, readOpenPositions, type WalletOpenPositions } from "@/lib/open-positions";
import { refreshBadges } from "@/lib/badges/compute";

const AVATAR_RECHECK_DAYS = 7;

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

async function enrichPoolsWithMints(pools: PortfolioPool[]): Promise<void> {
  // Fetch pool details to get token mints
  const poolsNeedingMints = pools.filter((p) => p.poolAddress && (!p.tokenXMint || !p.tokenYMint));
  
  for (const pool of poolsNeedingMints) {
    if (!pool.poolAddress) continue;
    try {
      const info = await getJson(meteoraUrls.pool(pool.poolAddress), 600000); // Cache for 10 min
      if (info) {
        const xMint = mintOf(info.token_x);
        const yMint = mintOf(info.token_y);
        if (xMint) pool.tokenXMint = xMint;
        if (yMint) pool.tokenYMint = yMint;
        
        // Also get icons if not already set
        if (!pool.tokenXIcon && xMint && KNOWN_ICONS[xMint]) {
          pool.tokenXIcon = KNOWN_ICONS[xMint];
        }
        if (!pool.tokenYIcon && yMint && KNOWN_ICONS[yMint]) {
          pool.tokenYIcon = KNOWN_ICONS[yMint];
        }
      }
    } catch {
      // Ignore errors, mints will remain null
    }
  }
}

async function getJson(url: string, ttlMs = 60000): Promise<Json | null> {
  try {
    const data = await fetchMeteora<Json>(url, ttlMs);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

interface PortfolioPool {
  poolAddress?: string;
  binStep?: string | number;
  tokenX?: string;
  tokenY?: string;
  tokenXMint?: string;
  tokenYMint?: string;
  tokenXIcon?: string;
  tokenYIcon?: string;
  pnlUsd?: string | number;
  pnl?: string | number;
  lastClosedAt?: number;
  balances?: string | number;
  unclaimedFees?: string | number;
  openPositionCount?: number;
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

async function resolveTopPoolMultiWallet(biggestPnlPool: string | null, allPortfolioPools: PortfolioPool[], openPools: PortfolioPool[]): Promise<TopPool | null> {
  const all = [...openPools, ...allPortfolioPools];
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

  // 1) The pool behind the biggest 30D win across all wallets, if it's a DLMM pool.
  if (biggestPnlPool) {
    const known = byAddr.get(biggestPnlPool);
    if (known) return fromPortfolio(known);
    const info = await getJson(meteoraUrls.pool(biggestPnlPool));
    if (info && typeof info.name === "string") {
      const cfg = info.pool_config as Json | undefined;
      return {
        address: biggestPnlPool,
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
  const recent = allPortfolioPools.filter((p) => (p.lastClosedAt || 0) >= cutoff);
  const candidates = [...openPools, ...(recent.length ? recent : allPortfolioPools)];
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

interface WalletData {
  wallet: string;
  total: Json | null;
  /** Every open pool across Meteora's pages; null when any page failed. */
  open: WalletOpenPositions | null;
  portfolio: Json | null;
  perf7: Json | null;
  perf30: Json | null;
  perfAll: Json | null;
}

/** Pull Meteora data for a single wallet. */
async function fetchWalletData(wallet: string): Promise<WalletData> {
  const [total, open, portfolio, perf7, perf30, perfAll] = await Promise.all([
    getJson(meteoraUrls.portfolioTotal(wallet)),
    fetchWalletOpenPositions(wallet),
    getJson(meteoraUrls.portfolio(wallet, 100)),
    getJson(meteoraUrls.performance(wallet, "7d")),
    getJson(meteoraUrls.performance(wallet, "30d")),
    getJson(meteoraUrls.performance(wallet, "all")),
  ]);
  return { wallet, total, open, portfolio, perf7, perf30, perfAll };
}

/** Aggregate performance metrics across all user wallets and upsert today's snapshot. */
export async function syncUser(user: UserRow): Promise<SyncResult> {
  const db = getDb();
  
  // Primary wallet + linked wallets (new signups have no user_wallets row yet).
  const walletAddresses = await getUserWalletAddresses(user);

  if (walletAddresses.length === 0) {
    return { ok: false, wallet: user.wallet, date: todayUtc(), error: "No wallets configured" };
  }

  // Backfill avatar if needed
  if (user.xHandle && !user.xAvatarUrl && shouldCheckAvatar(user.avatarCheckedAt)) {
    void backfillAvatar(user.id, user.xHandle);
  }

  // Fetch data for all wallets in parallel
  const walletDataList = await Promise.all(walletAddresses.map((address) => fetchWalletData(address)));

  const date = todayUtc();
  const hasAnyData = walletDataList.some((wd) => wd.total || wd.perf30 || wd.perfAll);
  if (!hasAnyData) {
    return { ok: false, wallet: user.wallet, date, error: "Meteora APIs unavailable" };
  }

  // Open positions across all wallets. Meteora lists them per pool (several positions in one pool =
  // one entry with a count), paginated; fetchWalletOpenPositions follows every page. The snapshot's
  // "Open positions" count and value are derived from the same merged pools that get stored in
  // open_positions, so the profile stat and the list always agree.
  const openOk = walletDataList.every((wd) => wd.open);
  const allOpenPools: PortfolioPool[] = walletDataList.flatMap((wd) => wd.open?.pools ?? []);
  const mergedPools = mergeOpenPools(walletDataList.map((wd) => wd.open?.pools ?? []));
  let totalOpenPositions: number;
  let openValueUsd: number;
  if (openOk) {
    totalOpenPositions = mergedPools.reduce((s, p) => s + p.positionCount, 0);
    openValueUsd = mergedPools.reduce((s, p) => s + p.valueUsd, 0);
    const reported = walletDataList.reduce((s, wd) => s + (wd.open?.reportedPositions ?? 0), 0);
    if (reported !== totalOpenPositions) {
      console.warn(`[sync] user ${user.id}: Meteora reports ${reported} open positions, its pools add up to ${totalOpenPositions}`);
    }
  } else {
    // A wallet's open positions couldn't be fetched: keep the stored list and its count rather than
    // replacing them with a partial answer (or wiping them).
    const stored = await readOpenPositions(user.id);
    totalOpenPositions = stored.totalPositions;
    openValueUsd = stored.totalValueUsd;
  }

  // Aggregate performance data across all wallets
  let totalPnlUsd = 0;
  let pnl7d = 0;
  let pnl30d = 0;
  let volumeUsd = 0;
  let volume7dUsd = 0;
  let volume30dUsd = 0;
  let feesUsd = 0;
  let fees7dUsd = 0;
  let fees30dUsd = 0;
  let positionsClosed = 0;
  
  // Win rate calculation: total wins / total closed positions across wallets
  let totalWinCountAll = 0;
  let totalLossCountAll = 0;
  let totalWinCount7d = 0;
  let totalLossCount7d = 0;
  let totalWinCount30d = 0;
  let totalLossCount30d = 0;

  // Biggest win across all wallets
  let biggestPnlPool: string | null = null;
  let biggestPnlValue = -Infinity;

  // Collect all pools for topPool resolution
  const allPortfolioPools: PortfolioPool[] = [];
  
  for (const wd of walletDataList) {
    // Total PnL
    if (wd.total) {
      totalPnlUsd += num(wd.total.totalPnlUsd);
    } else if (wd.perfAll) {
      totalPnlUsd += num(wd.perfAll.pnl_usd);
    }

    // Closed positions
    if (wd.total) {
      positionsClosed += Math.round(num(wd.total.totalClosedPositions));
    }

    // 7d metrics
    if (wd.perf7) {
      pnl7d += num(wd.perf7.pnl_usd);
      volume7dUsd += num(wd.perf7.total_deposit_usd);
      fees7dUsd += num(wd.perf7.realized_fee_earned_usd) + num(wd.perf7.unrealized_fee_earned_usd);
      totalWinCount7d += num(wd.perf7.win_count_usd);
      totalLossCount7d += num(wd.perf7.loss_count_usd);
    }

    // 30d metrics
    if (wd.perf30) {
      pnl30d += num(wd.perf30.pnl_usd);
      volume30dUsd += num(wd.perf30.total_deposit_usd);
      fees30dUsd += num(wd.perf30.realized_fee_earned_usd) + num(wd.perf30.unrealized_fee_earned_usd);
      totalWinCount30d += num(wd.perf30.win_count_usd);
      totalLossCount30d += num(wd.perf30.loss_count_usd);
      
      // Check for biggest win
      const dlmm = wd.perf30.dlmm as Json | undefined;
      const bigPool = typeof dlmm?.biggest_pnl_usd_pool === "string" ? dlmm.biggest_pnl_usd_pool : null;
      const bigPnl = typeof dlmm?.biggest_pnl_usd === "number" ? dlmm.biggest_pnl_usd : -Infinity;
      if (bigPool && bigPnl > biggestPnlValue) {
        biggestPnlValue = bigPnl;
        biggestPnlPool = bigPool;
      }
    }

    // All-time metrics
    if (wd.perfAll) {
      volumeUsd += num(wd.perfAll.total_deposit_usd);
      feesUsd += num(wd.perfAll.realized_fee_earned_usd) + num(wd.perfAll.unrealized_fee_earned_usd);
      totalWinCountAll += num(wd.perfAll.win_count_usd);
      totalLossCountAll += num(wd.perfAll.loss_count_usd);
    }

    // Collect portfolio pools
    if (wd.portfolio) {
      allPortfolioPools.push(...asPools(wd.portfolio.pools));
    }
  }

  // Calculate combined win rates (never an average of averages)
  const totalTradesAll = totalWinCountAll + totalLossCountAll;
  const totalTrades7d = totalWinCount7d + totalLossCount7d;
  const totalTrades30d = totalWinCount30d + totalLossCount30d;
  
  const winRate = totalTradesAll > 0 ? totalWinCountAll / totalTradesAll : null;
  const winRate7d = totalTrades7d > 0 ? totalWinCount7d / totalTrades7d : null;
  const winRate30d = totalTrades30d > 0 ? totalWinCount30d / totalTrades30d : null;

  // Distinct pools LP'd (Pool Hopper badge): Meteora's portfolio pool count per wallet, or the union of
  // pool addresses we saw (portfolio page + open), whichever is larger. A lower bound across wallets.
  const seenPools = new Set(
    [...allPortfolioPools, ...allOpenPools].map((p) => p.poolAddress).filter((a): a is string => Boolean(a))
  );
  const portfolioPoolCount = Math.max(0, ...walletDataList.map((wd) => Math.round(num(wd.portfolio?.totalCount))));
  const distinctPools = Math.max(seenPools.size, portfolioPoolCount);

  // Resolve top pool across all wallets
  const topPool = await resolveTopPoolMultiWallet(biggestPnlPool, allPortfolioPools, mergedPools);

  const snapshot: NewSnapshot = {
    userId: user.id,
    date,
    totalPnlUsd: totalPnlUsd || null,
    pnl7d: pnl7d || null,
    pnl30d: pnl30d || null,
    volumeUsd: volumeUsd || null,
    volume7dUsd: volume7dUsd || null,
    volume30dUsd: volume30dUsd || null,
    feesUsd: feesUsd || null,
    fees7dUsd: fees7dUsd || null,
    fees30dUsd: fees30dUsd || null,
    winRate,
    winRate7d,
    winRate30d,
    positionsOpen: totalOpenPositions,
    positionsClosed: positionsClosed || null,
    portfolioValueUsd: openValueUsd || null,
    topPoolAddress: topPool?.address || null,
    topPoolName: topPool?.name || null,
    topPoolBinStep: topPool?.binStep ?? null,
    topPoolProtocol: topPool?.protocol || null,
    topPoolXIcon: topPool?.xIcon || null,
    topPoolYIcon: topPool?.yIcon || null,
    source: {
      fetchedAt: new Date().toISOString(),
      distinctPools,
      wallets: walletDataList.map((wd) => ({
        wallet: wd.wallet,
        total: wd.total,
        openTotals: wd.open ? { totalPositions: wd.open.reportedPositions, pools: wd.open.pools.length } : null,
        perf7: wd.perf7 ? stripNested(wd.perf7) : null,
        perf30: wd.perf30 ? stripNested(wd.perf30) : null,
        perfAll: wd.perfAll ? stripNested(wd.perfAll) : null,
      })),
    },
  };

  const { userId: _u, date: _d, ...updatable } = snapshot;
  void _u;
  void _d;

  // Fetch mints for pools that don't have them yet, and per-position details (network; outside the transaction).
  if (openOk) {
    await enrichPoolsWithMints(mergedPools);
    await attachPositionDetails(
      walletDataList.map((wd) => ({ wallet: wd.wallet, pools: wd.open?.pools ?? [] })),
      mergedPools,
      (await readOpenPositions(user.id)).pools
    );
  }

  // Snapshot + open_positions in one transaction, so the count and the list can't be half-updated.
  // Opened/closed rows feed the Activity feed (lib/activity.ts).
  const openedRows: SyncedPosition[] = [];
  const closedRows: SyncedPosition[] = [];
  await db.transaction(async (tx) => {
    await tx
      .insert(pnlSnapshots)
      .values(snapshot)
      .onConflictDoUpdate({
        target: [pnlSnapshots.userId, pnlSnapshots.date],
        set: { ...updatable, updatedAt: sql`now()` },
      });

    if (!openOk) return;

    // Delete pools that no longer have an open position.
    const currentPoolAddresses = mergedPools.map((p) => p.poolAddress);
    closedRows.push(
      ...(await tx
        .delete(openPositions)
        .where(
          currentPoolAddresses.length > 0
            ? and(eq(openPositions.userId, user.id), sql`${openPositions.poolAddress} NOT IN ${currentPoolAddresses}`)
            : eq(openPositions.userId, user.id)
        )
        .returning())
    );

    // Upsert one row per pool, with how many positions the user has in it.
    for (const pool of mergedPools) {
      const fields = {
        tokenX: pool.tokenX || "?",
        tokenY: pool.tokenY || "?",
        tokenXMint: pool.tokenXMint || null,
        tokenYMint: pool.tokenYMint || null,
        tokenXIcon: pool.tokenXIcon || null,
        tokenYIcon: pool.tokenYIcon || null,
        binStep: pool.binStep != null ? Math.round(num(pool.binStep)) : null,
        valueUsd: pool.valueUsd,
        positionCount: pool.positionCount,
        // Only overwrite stored details when this sync fetched them.
        ...(pool.positions ? { positions: pool.positions } : {}),
      };
      const [upserted] = await tx
        .insert(openPositions)
        .values({ userId: user.id, poolAddress: pool.poolAddress, protocol: "dlmm", ...fields })
        .onConflictDoUpdate({
          target: [openPositions.userId, openPositions.poolAddress],
          set: { ...fields, updatedAt: sql`now()` },
        })
        // xmax = 0 means the row was inserted (newly opened), not updated.
        .returning({
          id: openPositions.id,
          poolAddress: openPositions.poolAddress,
          tokenX: openPositions.tokenX,
          tokenY: openPositions.tokenY,
          tokenXMint: openPositions.tokenXMint,
          tokenXIcon: openPositions.tokenXIcon,
          tokenYIcon: openPositions.tokenYIcon,
          binStep: openPositions.binStep,
          protocol: openPositions.protocol,
          createdAt: openPositions.createdAt,
          positions: openPositions.positions,
          inserted: sql<boolean>`(xmax = 0)`,
        });
      if (upserted?.inserted) openedRows.push(upserted);
    }
  });

  // Only trust the diff when every wallet's open-positions call succeeded; a failed fetch would look
  // like closes (and reopens next sync).
  if (openOk) {
    await recordSyncActivity(user.id, openedRows, closedRows, allPortfolioPools);
  }

  // Badges from the snapshot just written (members only, upgrade-only, never throws).
  await refreshBadges(user.id, { announce: true });
  
  await db.update(users).set({ lastSyncedAt: sql`now()`, lastAttemptedAt: sql`now()` }).where(eq(users.id, user.id));

  return { ok: true, wallet: user.wallet, date, snapshot };
}

function stripNested(p: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(p)) if (v === null || typeof v !== "object") out[k] = v;
  return out;
}

function shouldCheckAvatar(lastCheckedAt: Date | null): boolean {
  if (!lastCheckedAt) return true;
  const daysSince = (Date.now() - lastCheckedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= AVATAR_RECHECK_DAYS;
}

async function backfillAvatar(userId: number, xHandle: string): Promise<void> {
  try {
    const res = await fetch(`https://unavatar.io/x/${xHandle}?json`, {
      redirect: "manual",
      cache: "no-store",
    });

    let avatarUrl: string | null = null;

    if (res.status >= 200 && res.status < 300) {
      const data = await res.json();
      if (data && typeof data === "object" && typeof (data as Record<string, unknown>).url === "string") {
        avatarUrl = (data as Record<string, unknown>).url as string;
      }
    } else if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location && location.includes("pbs.twimg.com")) {
        avatarUrl = location;
      }
    }

    const db = getDb();
    if (avatarUrl) {
      await db
        .update(users)
        .set({ xAvatarUrl: avatarUrl, avatarCheckedAt: sql`now()` })
        .where(eq(users.id, userId));
    } else {
      await db
        .update(users)
        .set({ avatarCheckedAt: sql`now()` })
        .where(eq(users.id, userId));
    }
  } catch {
    // Ignore avatar backfill errors
  }
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
