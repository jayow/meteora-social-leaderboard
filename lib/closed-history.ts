import { createHmac } from "crypto";
import { getPool } from "@/lib/db";
import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";
import { getUserWalletAddresses } from "@/lib/users";
import type { UserRow } from "@/lib/db/schema";
import type { ClosedPool } from "@/lib/closed-positions";

/**
 * Stored closed-position history (closed_positions), so profiles read closes from our database instead
 * of Meteora on every view.
 * - captureRecentCloses: every sync lists pools with a close in the last 7 days (1 call per wallet) and
 *   fetches positions only for pools whose latest close is newer than what's stored.
 * - backfillClosedPositions: the cron fills the past year per member within a time budget, resuming
 *   from users.closed_backfill_cursor.
 * Rows are keyed by an HMAC of the position address; no position or wallet addresses are stored.
 */

const BACKFILL_DAYS = 365;
/** Look-back for capture: long enough to cover a few days of failed syncs; still one list call per wallet. */
const RECENT_DAYS = 7;
const MAX_LIST_PAGES = 10;
const MAX_POSITION_PAGES = 20;
const TTL_MS = 60_000;

type Json = Record<string, unknown>;

interface PoolEntry {
  wallet: string;
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenYMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  /** Unix seconds. */
  lastClosedAt: number;
}

interface Row {
  positionKey: string;
  minPrice: number | null;
  maxPrice: number | null;
  openedAt: number | null;
  closedAt: number;
  capitalUsd: number;
  withdrawnUsd: number;
  feesUsd: number;
  pnlUsd: number;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const usdTotal = (v: unknown): number => num(((v as Json | undefined)?.total as Json | undefined)?.usd) ?? 0;

function positionKey(address: string): string {
  const secret = process.env.APP_SECRET || process.env.X_CLIENT_SECRET || "pool-party";
  return createHmac("sha256", secret).update(address).digest("hex");
}

/** Pools a wallet closed a position in during the last `days` days (Meteora caps this at 365). */
async function listPools(wallet: string, days: number): Promise<PoolEntry[] | null> {
  const out: PoolEntry[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page++) {
    const data = await fetchMeteoraOrNull<Json>(meteoraUrls.portfolioClosed(wallet, days, page), TTL_MS);
    if (!data) return page === 1 ? null : out;
    for (const p of Array.isArray(data.pools) ? (data.pools as Json[]) : []) {
      const poolAddress = str(p.poolAddress);
      if (!poolAddress) continue;
      out.push({
        wallet,
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
    if (data.hasNext !== true) break;
  }
  return out;
}

/** A wallet's closed positions in one pool that closed at or after `since` (unix seconds). */
async function poolCloses(pool: PoolEntry, since: number): Promise<Row[] | null> {
  const out: Row[] = [];
  for (let page = 1; page <= MAX_POSITION_PAGES; page++) {
    const data = await fetchMeteoraOrNull<Json>(meteoraUrls.poolPositions(pool.poolAddress, pool.wallet, "closed", page, 100), TTL_MS);
    if (!data) return null;
    for (const p of Array.isArray(data.positions) ? (data.positions as Json[]) : []) {
      const address = str(p.positionAddress);
      const closedAt = num(p.closedAt);
      if (!address || closedAt == null || closedAt < since) continue;
      out.push({
        positionKey: positionKey(address),
        minPrice: num(p.minPrice),
        maxPrice: num(p.maxPrice),
        openedAt: num(p.createdAt),
        closedAt,
        capitalUsd: usdTotal(p.allTimeDeposits),
        withdrawnUsd: usdTotal(p.allTimeWithdrawals),
        feesUsd: usdTotal(p.allTimeFees),
        pnlUsd: num(p.pnlUsd) ?? 0,
      });
    }
    if (data.hasNext !== true) break;
  }
  return out;
}

/** Insert closes, skipping ones already stored. Returns how many were new. */
async function storeCloses(userId: number, pool: PoolEntry, rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = 18;
  const values: unknown[] = [];
  const tuples = rows.map((r, i) => {
    values.push(
      userId, r.positionKey, pool.poolAddress, pool.tokenX, pool.tokenY, pool.tokenXMint, pool.tokenYMint, pool.tokenXIcon,
      pool.tokenYIcon, pool.binStep, r.minPrice, r.maxPrice, r.openedAt, r.closedAt, r.capitalUsd, r.withdrawnUsd, r.feesUsd, r.pnlUsd
    );
    const b = i * cols;
    const ph = Array.from({ length: cols }, (_, k) => {
      const n = `$${b + k + 1}`;
      return k === 12 || k === 13 ? `to_timestamp(${n})` : n;
    });
    return `(${ph.join(", ")})`;
  });
  const res = await getPool().query(
    `INSERT INTO closed_positions (user_id, position_key, pool_address, token_x, token_y, token_x_mint, token_y_mint, token_x_icon,
       token_y_icon, bin_step, min_price, max_price, opened_at, closed_at, capital_usd, withdrawn_usd, fees_usd, pnl_usd)
     VALUES ${tuples.join(", ")}
     ON CONFLICT (user_id, position_key) DO NOTHING`,
    values
  );
  return res.rowCount ?? 0;
}

/** Latest stored close per pool for a member (unix seconds). */
async function storedLastClose(userId: number): Promise<Map<string, number>> {
  const { rows } = await getPool().query<{ pool_address: string; last: number }>(
    `SELECT pool_address, extract(epoch FROM max(closed_at))::float8 AS last FROM closed_positions WHERE user_id = $1 GROUP BY pool_address`,
    [userId]
  );
  return new Map(rows.map((r) => [r.pool_address, r.last]));
}

/**
 * Record closes from the last week. Called by every sync: one Meteora call per wallet, plus
 * one per pool that has a close we haven't stored. Returns how many closes were new.
 */
export async function captureRecentCloses(user: Pick<UserRow, "id">, wallets: string[]): Promise<number> {
  const stored = await storedLastClose(user.id);
  const since = Math.floor(Date.now() / 1000) - (RECENT_DAYS + 1) * 86400;
  let added = 0;
  for (const wallet of wallets) {
    const pools = await listPools(wallet, RECENT_DAYS);
    for (const pool of pools ?? []) {
      if (pool.lastClosedAt <= (stored.get(pool.poolAddress) ?? 0)) continue;
      const rows = await poolCloses(pool, since);
      if (rows) added += await storeCloses(user.id, pool, rows);
    }
  }
  return added;
}

/**
 * Fill one member's past year of closes until `deadline` (ms). Resumes from closed_backfill_cursor and
 * marks closed_backfill_at when done. Returns true when the member is fully backfilled.
 */
export async function backfillClosedPositions(user: Pick<UserRow, "id" | "wallet" | "closedBackfillCursor">, deadline: number): Promise<boolean> {
  const wallets = await getUserWalletAddresses(user);
  const lists = await Promise.all(wallets.map((w) => listPools(w, BACKFILL_DAYS)));
  if (lists.some((l) => l === null)) return false; // Meteora unavailable: try again next run
  // Stable order so the cursor means the same pool next run.
  const entries = lists.flatMap((l) => l ?? []).sort((a, b) => `${a.wallet}:${a.poolAddress}`.localeCompare(`${b.wallet}:${b.poolAddress}`));
  const since = Math.floor(Date.now() / 1000) - BACKFILL_DAYS * 86400;
  let cursor = Math.min(user.closedBackfillCursor, entries.length);
  while (cursor < entries.length) {
    if (Date.now() > deadline) {
      await getPool().query(`UPDATE users SET closed_backfill_cursor = $2 WHERE id = $1`, [user.id, cursor]);
      return false;
    }
    const rows = await poolCloses(entries[cursor], since);
    if (rows === null) {
      await getPool().query(`UPDATE users SET closed_backfill_cursor = $2 WHERE id = $1`, [user.id, cursor]);
      return false;
    }
    await storeCloses(user.id, entries[cursor], rows);
    cursor++;
  }
  await getPool().query(`UPDATE users SET closed_backfill_at = now(), closed_backfill_cursor = 0 WHERE id = $1`, [user.id]);
  return true;
}

/** Cron step: backfill members who don't have their history yet, oldest members first, until `deadline`. */
export async function runClosedBackfill(deadline: number): Promise<{ worked: number; completed: number }> {
  const { rows } = await getPool().query<{ id: number; wallet: string; closed_backfill_cursor: number }>(
    `SELECT u.id, u.wallet, u.closed_backfill_cursor FROM users u
     WHERE u.joined_at IS NOT NULL AND u.closed_backfill_at IS NULL AND NOT u.seeded
       AND (u.wallet NOT LIKE 'temp\\_%' OR EXISTS (SELECT 1 FROM user_wallets w WHERE w.user_id = u.id))
     ORDER BY u.joined_at ASC LIMIT 20`
  );
  let worked = 0;
  let completed = 0;
  for (const r of rows) {
    if (Date.now() > deadline) break;
    worked++;
    try {
      if (await backfillClosedPositions({ id: r.id, wallet: r.wallet, closedBackfillCursor: r.closed_backfill_cursor }, deadline)) completed++;
    } catch (error) {
      console.error(`[closed-history] backfill failed for user ${r.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { worked, completed };
}

/* ------------------------------------------------------------------------------------------------ */
/* Reads                                                                                             */
/* ------------------------------------------------------------------------------------------------ */

interface PoolAggRow {
  pool_address: string;
  token_x: string;
  token_y: string;
  token_x_mint: string | null;
  token_y_mint: string | null;
  token_x_icon: string | null;
  token_y_icon: string | null;
  bin_step: number | null;
  capital: number;
  fees: number;
  pnl: number;
  last: number;
  n: number;
}

const POOL_AGG = `SELECT pool_address, max(token_x) AS token_x, max(token_y) AS token_y, max(token_x_mint) AS token_x_mint,
    max(token_y_mint) AS token_y_mint, max(token_x_icon) AS token_x_icon, max(token_y_icon) AS token_y_icon, max(bin_step) AS bin_step,
    sum(capital_usd)::float8 AS capital, sum(fees_usd)::float8 AS fees, sum(pnl_usd)::float8 AS pnl,
    extract(epoch FROM max(closed_at))::float8 AS last, count(*)::int AS n
  FROM closed_positions WHERE user_id = $1 AND closed_at > now() - make_interval(days => $2)`;

const toPool = (r: PoolAggRow): ClosedPool => ({
  poolAddress: r.pool_address,
  tokenX: r.token_x,
  tokenY: r.token_y,
  tokenXMint: r.token_x_mint,
  tokenYMint: r.token_y_mint,
  tokenXIcon: r.token_x_icon,
  tokenYIcon: r.token_y_icon,
  binStep: r.bin_step,
  capitalUsd: r.capital,
  feesUsd: r.fees,
  pnlUsd: r.pnl,
  pnlPct: r.capital > 0 ? r.pnl / r.capital : null,
  lastClosedAt: r.last,
  positionCount: r.n,
  positions: [],
});

/** A page of stored closed pools in the last `days` days (newest close first), plus exact totals. */
export async function readStoredClosed(
  userId: number,
  days: number,
  offset: number,
  limit: number
): Promise<{ pools: ClosedPool[]; totalPools: number; pnlUsd: number }> {
  const db = getPool();
  const [page, totals] = await Promise.all([
    db.query<PoolAggRow>(`${POOL_AGG} GROUP BY pool_address ORDER BY last DESC OFFSET $3 LIMIT $4`, [userId, days, offset, limit]),
    db.query<{ pools: number; pnl: number | null }>(
      `SELECT count(DISTINCT pool_address)::int AS pools, sum(pnl_usd)::float8 AS pnl
       FROM closed_positions WHERE user_id = $1 AND closed_at > now() - make_interval(days => $2)`,
      [userId, days]
    ),
  ]);
  return { pools: page.rows.map(toPool), totalPools: totals.rows[0]?.pools ?? 0, pnlUsd: totals.rows[0]?.pnl ?? 0 };
}

/** One stored pool's closed result in the last `days` days, or null. */
export async function readStoredClosedPool(userId: number, days: number, poolAddress: string): Promise<ClosedPool | null> {
  const { rows } = await getPool().query<PoolAggRow>(`${POOL_AGG} AND pool_address = $3 GROUP BY pool_address`, [userId, days, poolAddress]);
  return rows[0] ? toPool(rows[0]) : null;
}
