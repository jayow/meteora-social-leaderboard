import { getPool } from "@/lib/db";
import { positionShareSql } from "@/lib/activity";
import { BADGES, parseBadgeActivityKey } from "@/lib/badges/config";

/**
 * In-app notifications, derived at read time from rows that already exist (no separate write path):
 * - follow: someone followed you (follows; gone if they unfollow)
 * - invite: someone joined with one of your invite codes (users.invited_by_user_id)
 * - like: likes on your LP ideas, one item per idea with the like count (thesis_likes)
 * - badge: a badge or higher tier you earned, podium finishes included (activity kind 'badge')
 * - opened: someone you follow opened a position in a pool you're in (activity kind 'opened';
 *   only for members who share position activity, same rule as Poolside)
 * - announcement: admin posts to every member (announcements)
 * Only joined actors appear. Read state is one timestamp per member (users.notifications_seen_at).
 * Members can turn off any kind except announcements (users.notifications_muted).
 * Nothing here selects wallet addresses.
 */

export type NotificationKind = "follow" | "invite" | "like" | "badge" | "opened" | "announcement";

/** Kinds a member can turn off in settings; announcements always come through. */
export const MUTABLE_KINDS = ["follow", "invite", "like", "badge", "opened"] as const;
export type MutableKind = (typeof MUTABLE_KINDS)[number];

export function isMutableKind(v: unknown): v is MutableKind {
  return typeof v === "string" && (MUTABLE_KINDS as readonly string[]).includes(v);
}

export interface NotificationActor {
  id: number;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  anonName: string | null;
}

export interface NotificationItem {
  /** Stable key, e.g. "follow:12". */
  key: string;
  kind: NotificationKind;
  /** ISO time. */
  at: string;
  unread: boolean;
  actor: NotificationActor | null;
  /** like: total likes on the idea. */
  count?: number;
  /** like / opened: the pool label ("SI-SOL"). */
  poolName?: string | null;
  /** badge: "Fee Farmer Silver". */
  badge?: string;
  /** announcement text. */
  body?: string;
  /** Where the row links to (a site path or, for announcements, an https URL). */
  href: string | null;
}

export interface Announcement {
  id: number;
  body: string;
  linkUrl: string | null;
  createdAt: string;
}

const WINDOW_DAYS = 30;
const LIMIT = 30;
const TIER = ["", "Bronze", "Silver", "Gold"];

const ACTOR_COLS = (u: string) =>
  `${u}.id AS actor_id, ${u}.x_handle, ${u}.x_name, ${u}.x_avatar_url, ${u}.anon_name`;

interface ActorRow {
  actor_id: number;
  x_handle: string | null;
  x_name: string | null;
  x_avatar_url: string | null;
  anon_name: string | null;
}

const actorOf = (r: ActorRow): NotificationActor => ({
  id: r.actor_id,
  xHandle: r.x_handle,
  xName: r.x_name,
  xAvatarUrl: r.x_avatar_url,
  anonName: r.anon_name,
});

const profileHref = (a: NotificationActor) => `/profile/${a.xHandle || a.id}`;

/** A site path or an https URL; anything else is dropped. */
export function safeLink(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s.slice(0, 500);
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}

export async function listNotifications(
  userId: number
): Promise<{ items: NotificationItem[]; unreadCount: number; muted: MutableKind[] }> {
  const pool = getPool();
  const since = `now() - interval '${WINDOW_DAYS} days'`;
  const [me, follows, invites, likes, badges, opened, posts] = await Promise.all([
    pool.query<{ seen: Date | null; muted: string[] }>(
      `SELECT notifications_seen_at AS seen, notifications_muted AS muted FROM users WHERE id = $1`,
      [userId]
    ),
    pool.query<ActorRow & { id: number; at: Date }>(
      `SELECT f.id, f.created_at AS at, ${ACTOR_COLS("u")}
       FROM follows f JOIN users u ON u.id = f.follower_user_id
       WHERE f.followee_user_id = $1 AND u.joined_at IS NOT NULL AND f.created_at > ${since}
       ORDER BY f.created_at DESC LIMIT ${LIMIT}`,
      [userId]
    ),
    pool.query<ActorRow & { at: Date }>(
      `SELECT u.joined_at AS at, ${ACTOR_COLS("u")}
       FROM users u
       WHERE u.invited_by_user_id = $1 AND u.id <> $1 AND u.joined_at > ${since}
       ORDER BY u.joined_at DESC LIMIT ${LIMIT}`,
      [userId]
    ),
    // One row per idea: the latest liker, the latest like time and the total.
    pool.query<ActorRow & { comment_id: number; at: Date; count: string; pool_name: string | null; pool_address: string | null }>(
      `SELECT DISTINCT ON (l.comment_id) l.comment_id, l.created_at AS at, ${ACTOR_COLS("u")},
              c.pool_name, c.pool_address,
              (SELECT count(*) FROM thesis_likes l2 JOIN users u2 ON u2.id = l2.user_id
                WHERE l2.comment_id = l.comment_id AND l2.user_id <> $1 AND u2.joined_at IS NOT NULL) AS count
       FROM thesis_likes l
       JOIN token_comments c ON c.id = l.comment_id
       JOIN users u ON u.id = l.user_id
       WHERE c.user_id = $1 AND c.deleted_at IS NULL AND l.user_id <> $1 AND u.joined_at IS NOT NULL
         AND l.created_at > ${since}
       ORDER BY l.comment_id, l.created_at DESC
       LIMIT ${LIMIT}`,
      [userId]
    ),
    pool.query<{ id: number; at: Date; dedupe_key: string }>(
      `SELECT a.id, a.occurred_at AS at, a.dedupe_key FROM activity a
       WHERE a.actor_user_id = $1 AND a.kind = 'badge' AND a.occurred_at > ${since}
       ORDER BY a.occurred_at DESC LIMIT ${LIMIT}`,
      [userId]
    ),
    pool.query<ActorRow & { id: number; at: Date; pool_name: string | null; pool_address: string | null }>(
      `SELECT a.id, a.occurred_at AS at, a.pool_name, a.pool_address, ${ACTOR_COLS("u")}
       FROM activity a
       JOIN follows f ON f.followee_user_id = a.actor_user_id AND f.follower_user_id = $1
       JOIN users u ON u.id = a.actor_user_id
       WHERE a.kind = 'opened' AND a.occurred_at > ${since} AND u.joined_at IS NOT NULL
         AND ${positionShareSql("a", "u")}
         AND EXISTS (SELECT 1 FROM open_positions op WHERE op.user_id = $1 AND op.pool_address = a.pool_address)
       ORDER BY a.occurred_at DESC LIMIT ${LIMIT}`,
      [userId]
    ),
    pool.query<{ id: number; at: Date; body: string; link_url: string | null }>(
      `SELECT id, created_at AS at, body, link_url FROM announcements
       WHERE deleted_at IS NULL AND created_at > ${since}
       ORDER BY created_at DESC LIMIT ${LIMIT}`
    ),
  ]);

  const seen = me.rows[0]?.seen?.getTime() ?? -Infinity;
  const muted = (me.rows[0]?.muted ?? []).filter(isMutableKind);
  const items: NotificationItem[] = [];
  const push = (it: Omit<NotificationItem, "unread" | "at"> & { at: Date }) => {
    if (isMutableKind(it.kind) && muted.includes(it.kind)) return;
    items.push({ ...it, at: it.at.toISOString(), unread: it.at.getTime() > seen });
  };

  for (const r of follows.rows) {
    const actor = actorOf(r);
    push({ key: `follow:${r.id}`, kind: "follow", at: r.at, actor, href: profileHref(actor) });
  }
  for (const r of invites.rows) {
    const actor = actorOf(r);
    push({ key: `invite:${r.actor_id}`, kind: "invite", at: r.at, actor, href: profileHref(actor) });
  }
  for (const r of likes.rows) {
    push({
      key: `like:${r.comment_id}:${r.at.getTime()}`,
      kind: "like",
      at: r.at,
      actor: actorOf(r),
      count: Number(r.count) || 1,
      poolName: r.pool_name,
      href: r.pool_address ? `/pools/${r.pool_address}` : "/profile/me",
    });
  }
  for (const r of badges.rows) {
    const b = parseBadgeActivityKey(r.dedupe_key);
    if (!b) continue;
    const def = BADGES[b.id];
    push({
      key: `badge:${r.id}`,
      kind: "badge",
      at: r.at,
      actor: null,
      badge: def.tiered ? `${def.name} ${TIER[b.tier]}` : def.name,
      href: "/badges",
    });
  }
  for (const r of opened.rows) {
    push({
      key: `opened:${r.id}`,
      kind: "opened",
      at: r.at,
      actor: actorOf(r),
      poolName: r.pool_name,
      href: r.pool_address ? `/pools/${r.pool_address}` : null,
    });
  }
  for (const r of posts.rows) {
    push({ key: `announcement:${r.id}`, kind: "announcement", at: r.at, actor: null, body: r.body, href: safeLink(r.link_url) });
  }

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const top = items.slice(0, LIMIT);
  return { items: top, unreadCount: top.filter((i) => i.unread).length, muted };
}

/** The newest announcement this member hasn't dismissed (posted in the last 14 days), for the banner. */
export async function currentAnnouncement(userId: number): Promise<Announcement | null> {
  const { rows } = await getPool().query<{ id: number; body: string; link_url: string | null; created_at: Date }>(
    `SELECT a.id, a.body, a.link_url, a.created_at FROM announcements a, users u
     WHERE u.id = $1 AND a.deleted_at IS NULL AND a.created_at > now() - interval '14 days'
       AND (u.announcement_dismissed_at IS NULL OR a.created_at > u.announcement_dismissed_at)
     ORDER BY a.created_at DESC LIMIT 1`,
    [userId]
  );
  const r = rows[0];
  return r ? { id: r.id, body: r.body, linkUrl: safeLink(r.link_url), createdAt: r.created_at.toISOString() } : null;
}

export async function markNotificationsSeen(userId: number): Promise<void> {
  await getPool().query(`UPDATE users SET notifications_seen_at = now() WHERE id = $1`, [userId]);
}

export async function setMutedKinds(userId: number, kinds: MutableKind[]): Promise<void> {
  await getPool().query(`UPDATE users SET notifications_muted = $2::text[] WHERE id = $1`, [userId, [...new Set(kinds)]]);
}

export async function dismissAnnouncement(userId: number): Promise<void> {
  await getPool().query(`UPDATE users SET announcement_dismissed_at = now() WHERE id = $1`, [userId]);
}

export const ANNOUNCEMENT_MAX = 280;

export async function listAnnouncements(): Promise<Announcement[]> {
  const { rows } = await getPool().query<{ id: number; body: string; link_url: string | null; created_at: Date }>(
    `SELECT id, body, link_url, created_at FROM announcements WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 20`
  );
  return rows.map((r) => ({ id: r.id, body: r.body, linkUrl: r.link_url, createdAt: r.created_at.toISOString() }));
}

export async function createAnnouncement(body: string, linkUrl: string | null, createdBy: number): Promise<void> {
  await getPool().query(`INSERT INTO announcements (body, link_url, created_by_user_id) VALUES ($1, $2, $3)`, [body, linkUrl, createdBy]);
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await getPool().query(`UPDATE announcements SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
}
