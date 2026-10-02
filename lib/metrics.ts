import { getPool } from "@/lib/db";

/**
 * Read-side analytics over `events` and `users` for /api/admin/events and /api/admin/users.
 * Admin-only (lib/metrics-auth.ts). No wallet addresses are selected anywhere here.
 */

type Row = Record<string, string | number | boolean | null>;

export interface EventsReport {
  days: number;
  /** Every action in the window, most frequent first. */
  totals: { name: string; count: number; users: number }[];
  /** Per UTC day: active users / visitors (any event) and counts per action. */
  daily: { date: string; activeUsers: number; visitors: number; counts: Record<string, number> }[];
  topPages: { path: string; views: number; users: number }[];
  topClicks: { label: string; path: string; count: number }[];
  outbound: { host: string; to: string; count: number }[];
  /** Visitors -> signed in -> joined, in the window. */
  funnel: { visitors: number; signedIn: number; newAccounts: number; inviteChecks: number; joined: number };
}

export async function getEventsReport(days: number): Promise<EventsReport> {
  const pool = getPool();
  const since = `now() - ($1::int || ' days')::interval`;
  const q = <T extends Row>(sql: string) => pool.query<T>(sql, [days]).then((r) => r.rows);
  const [totals, dailyActive, dailyCounts, topPages, topClicks, outbound, funnel] = await Promise.all([
    q<{ name: string; count: number; users: number }>(
      `SELECT name, count(*)::int AS count, count(DISTINCT user_id)::int AS users
       FROM events WHERE at > ${since} GROUP BY name ORDER BY count DESC`
    ),
    q<{ date: string; active_users: number; visitors: number }>(
      `SELECT to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
              count(DISTINCT user_id)::int AS active_users,
              count(DISTINCT coalesce(visitor_id, 'u' || user_id))::int AS visitors
       FROM events WHERE at > ${since} GROUP BY 1 ORDER BY 1`
    ),
    q<{ date: string; name: string; count: number }>(
      `SELECT to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, name, count(*)::int AS count
       FROM events WHERE at > ${since} GROUP BY 1, 2`
    ),
    q<{ path: string; views: number; users: number }>(
      `SELECT path, count(*)::int AS views, count(DISTINCT user_id)::int AS users
       FROM events WHERE name = 'page_view' AND at > ${since} GROUP BY path ORDER BY views DESC LIMIT 30`
    ),
    q<{ label: string; path: string; count: number }>(
      `SELECT coalesce(props->>'label', '') AS label, coalesce(path, '') AS path, count(*)::int AS count
       FROM events WHERE name = 'click' AND at > ${since} GROUP BY 1, 2 ORDER BY count DESC LIMIT 50`
    ),
    q<{ host: string; to: string; count: number }>(
      `SELECT coalesce(props->>'host', '') AS host, coalesce(props->>'to', '') AS "to", count(*)::int AS count
       FROM events WHERE name = 'outbound' AND at > ${since} GROUP BY 1, 2 ORDER BY count DESC LIMIT 30`
    ),
    q<{ visitors: number; signed_in: number; new_accounts: number; invite_checks: number; joined: number }>(
      `SELECT
         (SELECT count(DISTINCT coalesce(visitor_id, 'u' || user_id)) FROM events WHERE name = 'page_view' AND at > ${since})::int AS visitors,
         (SELECT count(DISTINCT user_id) FROM events WHERE name = 'sign_in' AND at > ${since})::int AS signed_in,
         (SELECT count(*) FROM events WHERE name = 'sign_in' AND props->>'newAccount' = 'true' AND at > ${since})::int AS new_accounts,
         (SELECT count(*) FROM events WHERE name = 'invite_check' AND at > ${since})::int AS invite_checks,
         (SELECT count(*) FROM events WHERE name = 'join' AND props->>'ok' = 'true' AND at > ${since})::int AS joined`
    ),
  ]);
  const byDate = new Map<string, Record<string, number>>();
  for (const r of dailyCounts) byDate.set(r.date, { ...(byDate.get(r.date) ?? {}), [r.name]: r.count });
  const f = funnel[0];
  return {
    days,
    totals,
    daily: dailyActive.map((d) => ({ date: d.date, activeUsers: d.active_users, visitors: d.visitors, counts: byDate.get(d.date) ?? {} })),
    topPages,
    topClicks,
    outbound,
    funnel: { visitors: f.visitors, signedIn: f.signed_in, newAccounts: f.new_accounts, inviteChecks: f.invite_checks, joined: f.joined },
  };
}

export interface UserMetrics {
  id: number;
  name: string;
  memberNumber: number | null;
  signupMethod: string | null;
  hasX: boolean;
  country: string | null;
  createdAt: string;
  joinedAt: string | null;
  invitedByUserId: number | null;
  invitedByName: string | null;
  invitesCreated: number;
  invitesUsed: number;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  wallets: number;
  theses: number;
  likesGiven: number;
  followers: number;
  following: number;
  openPositions: number;
  openValueUsd: number;
  events7d: number;
  eventsTotal: number;
}

/** One row per account (members and signed-in non-members), newest first. */
export async function getUserMetrics(): Promise<UserMetrics[]> {
  const { rows } = await getPool().query<Row>(`
    SELECT u.id, coalesce(u.x_handle, u.anon_name, 'user ' || u.id) AS name, u.member_number, u.signup_method,
           (u.x_handle IS NOT NULL) AS has_x, u.country, u.created_at, u.joined_at,
           u.invited_by_user_id, coalesce(inv.x_handle, inv.anon_name) AS invited_by_name,
           (SELECT count(*) FROM invite_codes c WHERE c.created_by_user_id = u.id)::int AS invites_created,
           (SELECT coalesce(sum(c.uses), 0) FROM invite_codes c WHERE c.created_by_user_id = u.id)::int AS invites_used,
           u.last_seen_at, u.last_synced_at,
           (1 + (SELECT count(*) FROM user_wallets w WHERE w.user_id = u.id AND w.address <> u.wallet))::int AS wallets,
           (SELECT count(*) FROM token_comments t WHERE t.user_id = u.id AND t.deleted_at IS NULL)::int AS theses,
           (SELECT count(*) FROM thesis_likes l WHERE l.user_id = u.id)::int AS likes_given,
           (SELECT count(*) FROM follows f WHERE f.followee_user_id = u.id)::int AS followers,
           (SELECT count(*) FROM follows f WHERE f.follower_user_id = u.id)::int AS following,
           (SELECT coalesce(sum(coalesce(o.position_count, 1)), 0) FROM open_positions o WHERE o.user_id = u.id)::int AS open_positions,
           (SELECT coalesce(sum(o.value_usd), 0) FROM open_positions o WHERE o.user_id = u.id)::float AS open_value_usd,
           (SELECT count(*) FROM events e WHERE e.user_id = u.id AND e.at > now() - interval '7 days')::int AS events_7d,
           (SELECT count(*) FROM events e WHERE e.user_id = u.id)::int AS events_total
    FROM users u LEFT JOIN users inv ON inv.id = u.invited_by_user_id
    ORDER BY u.created_at DESC
  `);
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    memberNumber: r.member_number == null ? null : Number(r.member_number),
    signupMethod: (r.signup_method as string | null) ?? null,
    hasX: Boolean(r.has_x),
    country: (r.country as string | null) ?? null,
    createdAt: iso(r.created_at) as string,
    joinedAt: iso(r.joined_at),
    invitedByUserId: r.invited_by_user_id == null ? null : Number(r.invited_by_user_id),
    invitedByName: (r.invited_by_name as string | null) ?? null,
    invitesCreated: Number(r.invites_created),
    invitesUsed: Number(r.invites_used),
    lastSeenAt: iso(r.last_seen_at),
    lastSyncedAt: iso(r.last_synced_at),
    wallets: Number(r.wallets),
    theses: Number(r.theses),
    likesGiven: Number(r.likes_given),
    followers: Number(r.followers),
    following: Number(r.following),
    openPositions: Number(r.open_positions),
    openValueUsd: Number(r.open_value_usd),
    events7d: Number(r.events_7d),
    eventsTotal: Number(r.events_total),
  }));
}
