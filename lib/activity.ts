import { getPool } from "@/lib/db";
import { listTheses } from "@/lib/theses";
import { parseBadgeActivityKey } from "@/lib/badges/config";
import type {
  ActivityItem,
  ActivityKind,
  ActivityPerson,
  ActivityScope,
  EventKind,
  FeedFilter,
  FeedItem,
} from "@/lib/activity-types";

/**
 * Activity feed: write helpers (called at sync, comment, join and follow time) and the paginated read.
 *
 * Privacy rules, enforced here:
 * - Writes are skipped unless the actor has joined the beta (`users.joined_at`).
 * - Reads only return joined actors; follow events need a joined target and a follow that still exists;
 *   thesis events disappear when the comment is deleted.
 * - Position events (opened / closed / big win) are always stored but only read for members who opted
 *   in (`users.share_position_activity`), and only those at or after their latest opt-in
 *   (`share_position_activity_since`). Opting out hides them on the next read.
 * - Nothing in this module selects or returns wallet addresses.
 */

/** A closed position at or above this realized PnL (USD) is shown as a "big win". */
export function bigWinThresholdUsd(): number {
  const v = Number(process.env.ACTIVITY_BIG_WIN_USD);
  return Number.isFinite(v) && v > 0 ? v : 500;
}

export interface RecordActivityInput {
  actorUserId: number;
  kind: ActivityKind;
  /** Unique per logical event; repeated writes with the same key are no-ops. */
  dedupeKey: string;
  targetUserId?: number | null;
  poolAddress?: string | null;
  poolName?: string | null;
  protocol?: string | null;
  binStep?: number | null;
  tokenXIcon?: string | null;
  tokenYIcon?: string | null;
  tokenMint?: string | null;
  tokenSymbol?: string | null;
  commentId?: number | null;
  amountUsd?: number | null;
  occurredAt?: Date | null;
}

/**
 * Record one activity event. Idempotent (dedupe key) and never throws: the feed must not break the
 * action that triggered it (follow, comment, join, sync).
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  await recordActivities([input]);
}

export async function recordActivities(inputs: RecordActivityInput[]): Promise<void> {
  if (inputs.length === 0 || !process.env.DATABASE_URL) return;
  try {
    const pool = getPool();
    for (const a of inputs) {
      await pool.query(
        `INSERT INTO activity (actor_user_id, kind, target_user_id, pool_address, pool_name, protocol, bin_step,
                               token_x_icon, token_y_icon, token_mint, token_symbol, comment_id, amount_usd,
                               dedupe_key, occurred_at)
         SELECT u.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, coalesce($15::timestamptz, now())
         FROM users u
         WHERE u.id = $1 AND u.joined_at IS NOT NULL
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          a.actorUserId,
          a.kind,
          a.targetUserId ?? null,
          a.poolAddress ?? null,
          a.poolName ?? null,
          a.protocol ?? null,
          a.binStep ?? null,
          a.tokenXIcon ?? null,
          a.tokenYIcon ?? null,
          a.tokenMint ?? null,
          a.tokenSymbol ?? null,
          a.commentId ?? null,
          a.amountUsd != null && Number.isFinite(a.amountUsd) ? a.amountUsd : null,
          a.dedupeKey.slice(0, 160),
          a.occurredAt ? a.occurredAt.toISOString() : null,
        ]
      );
    }
  } catch (err: unknown) {
    console.error("[activity] record failed:", err instanceof Error ? err.message : err);
  }
}

/* ------------------------------------------------------------------------------------------------ */
/* Sync diffs                                                                                        */
/* ------------------------------------------------------------------------------------------------ */

/** An `open_positions` row as seen by the sync diff (no wallet data). */
export interface SyncedPosition {
  id: number;
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  protocol: string | null;
  createdAt: Date;
}

/** Minimal shape of a Meteora portfolio pool entry (closed-position history per pool). */
export interface PortfolioPoolStat {
  poolAddress?: string;
  pnlUsd?: string | number;
  lastClosedAt?: number;
}

/**
 * Turn one sync's open_positions diff into events: rows newly inserted are "opened", rows deleted are
 * "closed" (or "big_win" when the pool's realized PnL clears the threshold). Keyed by the
 * open_positions row id, so re-running a sync can't duplicate events and a reopen gets a new event.
 */
export async function recordSyncActivity(
  userId: number,
  opened: SyncedPosition[],
  closed: SyncedPosition[],
  portfolioPools: PortfolioPoolStat[]
): Promise<void> {
  const stats = new Map<string, { pnl: number; lastClosedAt: number }>();
  for (const p of portfolioPools) {
    if (!p.poolAddress) continue;
    const pnl = Number(p.pnlUsd ?? 0);
    const prev = stats.get(p.poolAddress) ?? { pnl: 0, lastClosedAt: 0 };
    stats.set(p.poolAddress, {
      pnl: prev.pnl + (Number.isFinite(pnl) ? pnl : 0),
      lastClosedAt: Math.max(prev.lastClosedAt, p.lastClosedAt ?? 0),
    });
  }
  const threshold = bigWinThresholdUsd();
  const now = Date.now();
  const base = (p: SyncedPosition) => ({
    actorUserId: userId,
    poolAddress: p.poolAddress,
    poolName: `${p.tokenX || "?"}-${p.tokenY || "?"}`,
    protocol: p.protocol,
    binStep: p.binStep,
    tokenXIcon: p.tokenXIcon,
    tokenYIcon: p.tokenYIcon,
    tokenMint: p.tokenXMint,
    tokenSymbol: p.tokenX || null,
  });

  // If a sync dropped rows because a Meteora call failed (no close recorded), the next sync re-inserts
  // them. Skip "opened" when the latest recorded event for that pool is already an open.
  const lastKind = new Map<string, string>();
  if (opened.length > 0 && process.env.DATABASE_URL) {
    try {
      const { rows } = await getPool().query<{ pool_address: string; kind: string }>(
        `SELECT DISTINCT ON (pool_address) pool_address, kind
         FROM activity
         WHERE actor_user_id = $1 AND pool_address = ANY($2::text[]) AND kind IN ('opened', 'closed', 'big_win')
         ORDER BY pool_address, occurred_at DESC, id DESC`,
        [userId, opened.map((p) => p.poolAddress)]
      );
      for (const r of rows) lastKind.set(r.pool_address, r.kind);
    } catch {
      // Worst case we record an extra "opened".
    }
  }

  const events: RecordActivityInput[] = [];
  for (const p of opened) {
    if (lastKind.get(p.poolAddress) === "opened") continue;
    events.push({ ...base(p), kind: "opened", dedupeKey: `opened:${p.id}` });
  }
  for (const p of closed) {
    const s = stats.get(p.poolAddress);
    const closedAtMs = s && s.lastClosedAt ? s.lastClosedAt * 1000 : 0;
    // Trust Meteora's close time only when it's after we first saw the position and not in the future.
    const occurredAt = closedAtMs > p.createdAt.getTime() && closedAtMs <= now ? new Date(closedAtMs) : null;
    const pnl = s ? s.pnl : null;
    events.push({
      ...base(p),
      kind: pnl != null && pnl >= threshold ? "big_win" : "closed",
      amountUsd: pnl,
      occurredAt,
      dedupeKey: `closed:${p.id}`,
    });
  }
  await recordActivities(events);
}

/* ------------------------------------------------------------------------------------------------ */
/* Read                                                                                              */
/* ------------------------------------------------------------------------------------------------ */

interface EventRow {
  id: number;
  kind: string;
  occurred_at: Date;
  pool_address: string | null;
  pool_name: string | null;
  protocol: string | null;
  bin_step: number | null;
  token_x_icon: string | null;
  token_y_icon: string | null;
  token_mint: string | null;
  token_symbol: string | null;
  amount_usd: number | null;
  dedupe_key: string;
  a_id: number;
  a_x_handle: string | null;
  a_x_avatar_url: string | null;
  a_anon_name: string | null;
  t_id: number | null;
  t_x_handle: string | null;
  t_x_avatar_url: string | null;
  t_anon_name: string | null;
}

const EVENT_KINDS: readonly EventKind[] = ["joined", "followed", "opened", "closed", "big_win", "badge"];

function isEventKind(k: string): k is EventKind {
  return (EVENT_KINDS as readonly string[]).includes(k);
}

/**
 * SQL condition: the event is not a position event, or its actor shares position activity and it
 * happened at/after their latest opt-in. `a` = activity alias, `u` = actor (users) alias.
 */
export function positionShareSql(a: string, u: string): string {
  return `(${a}.kind NOT IN ('opened', 'closed', 'big_win') OR (${u}.share_position_activity AND ${u}.share_position_activity_since IS NOT NULL AND ${a}.occurred_at >= ${u}.share_position_activity_since))`;
}

/** Stream rank inside one timestamp: posts (2) sort before events (1). Part of the cursor. */
const RANK_POST = 2;
const RANK_EVENT = 1;

export interface FeedCursor {
  ts: string;
  rank: number;
  id: number;
}

export function encodeCursor(c: FeedCursor): string {
  return Buffer.from(`${c.ts}|${c.rank}|${c.id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): FeedCursor | null {
  if (!cursor) return null;
  try {
    const [ts, rankStr, idStr] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const rank = Number(rankStr);
    const id = Number(idStr);
    if (!ts || Number.isNaN(Date.parse(ts))) return null;
    if (rank !== RANK_POST && rank !== RANK_EVENT) return null;
    if (!Number.isInteger(id) || id <= 0) return null;
    return { ts, rank, id };
  } catch {
    return null;
  }
}

export async function followeeCount(userId: number): Promise<number> {
  const { rows } = await getPool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM follows WHERE follower_user_id = $1`,
    [userId]
  );
  return rows[0]?.n ?? 0;
}

/** Hydrate activity events (never thesis rows: theses come from token_comments as posts). */
async function getEvents(ids: number[]): Promise<Map<number, ActivityItem>> {
  const out = new Map<number, ActivityItem>();
  if (ids.length === 0) return out;
  const { rows } = await getPool().query<EventRow>(
    `SELECT a.id, a.kind, a.occurred_at, a.pool_address, a.pool_name, a.protocol, a.bin_step, a.token_x_icon,
            a.token_y_icon, a.token_mint, a.token_symbol, a.amount_usd, a.dedupe_key,
            u.id AS a_id, u.x_handle AS a_x_handle, u.x_avatar_url AS a_x_avatar_url, u.anon_name AS a_anon_name,
            t.id AS t_id, t.x_handle AS t_x_handle, t.x_avatar_url AS t_x_avatar_url, t.anon_name AS t_anon_name
     FROM activity a
     JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN users t ON t.id = a.target_user_id
     WHERE a.id = ANY($1::int[])`,
    [ids]
  );
  for (const r of rows) {
    if (!isEventKind(r.kind)) continue;
    const actor: ActivityPerson = { id: r.a_id, xHandle: r.a_x_handle, xAvatarUrl: r.a_x_avatar_url, anonName: r.a_anon_name };
    const target: ActivityPerson | null =
      r.t_id != null ? { id: r.t_id, xHandle: r.t_x_handle, xAvatarUrl: r.t_x_avatar_url, anonName: r.t_anon_name } : null;
    out.set(r.id, {
      id: r.id,
      kind: r.kind,
      occurredAt: new Date(r.occurred_at).toISOString(),
      actor,
      target,
      pool:
        r.pool_address && r.pool_name
          ? { address: r.pool_address, name: r.pool_name, protocol: r.protocol, binStep: r.bin_step, xIcon: r.token_x_icon, yIcon: r.token_y_icon }
          : null,
      token: r.token_mint ? { mint: r.token_mint, symbol: r.token_symbol } : null,
      amountUsd: r.kind === "closed" || r.kind === "big_win" ? r.amount_usd : null,
      badge: r.kind === "badge" ? parseBadgeActivityKey(r.dedupe_key) : null,
    });
  }
  return out;
}

/**
 * Poolside stream: thesis posts (token_comments, public rule from lib/theses.ts) merged with activity
 * events (filter "all"), newest first. Keyset cursor over (time, rank, id) so the two sources page
 * together without gaps or repeats. Only joined actors; follow events need a joined target and a
 * follow that still exists; position events need the actor's opt-in (see positionShareSql). Deleted
 * theses never appear.
 */
export async function listFeed(opts: {
  scope: ActivityScope;
  filter: FeedFilter;
  viewerId: number | null;
  cursor: FeedCursor | null;
  limit: number;
}): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const params: (string | number)[] = [];
  const add = (v: string | number) => {
    params.push(v);
    return `$${params.length}`;
  };
  const following = opts.scope === "following" && opts.viewerId ? add(opts.viewerId) : null;
  const cur = opts.cursor ? { ts: add(opts.cursor.ts), rank: add(opts.cursor.rank), id: add(opts.cursor.id) } : null;
  const cursorSql = (tsCol: string, rank: number, idCol: string) =>
    cur ? `AND (${tsCol}, ${rank}, ${idCol}) < (${cur.ts}::timestamptz, ${cur.rank}::int, ${cur.id}::int)` : "";
  const followSql = (actorCol: string) =>
    following ? `AND ${actorCol} IN (SELECT followee_user_id FROM follows WHERE follower_user_id = ${following})` : "";
  const limit = add(opts.limit + 1);

  const posts = `
    SELECT ${RANK_POST} AS rank, tc.id, tc.created_at AS ts
    FROM token_comments tc JOIN users u ON u.id = tc.user_id AND u.joined_at IS NOT NULL
    WHERE tc.deleted_at IS NULL ${followSql("tc.user_id")} ${cursorSql("tc.created_at", RANK_POST, "tc.id")}`;
  const events = `
    SELECT ${RANK_EVENT} AS rank, a.id, a.occurred_at AS ts
    FROM activity a
    JOIN users u ON u.id = a.actor_user_id AND u.joined_at IS NOT NULL
    LEFT JOIN users t ON t.id = a.target_user_id
    WHERE a.kind IN ('joined', 'followed', 'opened', 'closed', 'big_win', 'badge')
      AND (a.kind <> 'followed' OR (t.joined_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_user_id = a.actor_user_id AND f.followee_user_id = a.target_user_id)))
      AND ${positionShareSql("a", "u")}
      ${followSql("a.actor_user_id")} ${cursorSql("a.occurred_at", RANK_EVENT, "a.id")}`;

  const { rows } = await getPool().query<{ rank: number; id: number; ts_text: string }>(
    `SELECT rank, id, to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ts_text
     FROM (${posts}${opts.filter === "all" ? ` UNION ALL ${events}` : ""}) s
     ORDER BY ts DESC, rank DESC, id DESC
     LIMIT ${limit}`,
    params
  );

  const page = rows.slice(0, opts.limit);
  const postIds = page.filter((r) => r.rank === RANK_POST).map((r) => r.id);
  const eventIds = page.filter((r) => r.rank === RANK_EVENT).map((r) => r.id);
  const [postList, eventsById] = await Promise.all([
    listTheses({ ids: postIds, viewerId: opts.viewerId, limit: Math.max(postIds.length, 1) }),
    getEvents(eventIds),
  ]);
  const postsById = new Map(postList.map((p) => [p.id, p]));

  const items: FeedItem[] = [];
  for (const r of page) {
    if (r.rank === RANK_POST) {
      const post = postsById.get(r.id);
      if (post) items.push({ type: "post", key: `post:${post.id}`, occurredAt: post.createdAt, post });
    } else {
      const event = eventsById.get(r.id);
      if (event) items.push({ type: "event", key: `event:${event.id}`, occurredAt: event.occurredAt, event });
    }
  }
  const last = page[page.length - 1];
  const nextCursor = rows.length > opts.limit && last ? encodeCursor({ ts: last.ts_text, rank: last.rank, id: last.id }) : null;
  return { items, nextCursor };
}

/** Thesis (token comment) posted: looks up the token symbol from the author's open position. */
export async function recordThesisActivity(userId: number, commentId: number, tokenMint: string, createdAt: Date): Promise<void> {
  let symbol: string | null = null;
  try {
    const { rows } = await getPool().query<{ token_x: string }>(
      `SELECT token_x FROM open_positions WHERE token_x_mint = $1 ORDER BY (user_id = $2) DESC LIMIT 1`,
      [tokenMint, userId]
    );
    symbol = rows[0]?.token_x ?? null;
  } catch {
    // Symbol is cosmetic; the row falls back to "a token".
  }
  await recordActivity({
    actorUserId: userId,
    kind: "thesis",
    tokenMint,
    tokenSymbol: symbol,
    commentId,
    occurredAt: createdAt,
    dedupeKey: `thesis:${commentId}`,
  });
}
