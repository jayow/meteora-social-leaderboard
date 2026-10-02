import { getPool } from "@/lib/db";
import { betaCap } from "@/lib/invite";

/** Admin dashboard numbers (one query). Counts only; no wallets or per-user data. */
export interface AdminStats {
  growth: {
    members: number;
    cap: number;
    joined7d: number;
    /** Signed in at least once but haven't joined with an invite. */
    waiting: number;
    invitesCreated: number;
    invitesUsed: number;
    /** Unused uses left on enabled codes. */
    invitesAvailable: number;
  };
  engagement: {
    active24h: number;
    active7d: number;
    lpIdeas: number;
    lpIdeas7d: number;
    likes: number;
    follows: number;
  };
  health: {
    lastSyncAt: string | null;
    /** Members synced in the last 30 minutes. */
    syncedRecently: number;
    /** Members not synced for over 2 hours (or never). */
    stale: number;
    /** Members whose last attempt failed (attempted after their last success). */
    failing: number;
    openPools: number;
    openPositions: number;
    openValueUsd: number;
    positionDetails: number;
    positionsWithShape: number;
  };
}

export async function getAdminStats(): Promise<AdminStats> {
  const { rows } = await getPool().query<Record<string, string | number | null>>(`
    WITH m AS (SELECT * FROM users WHERE joined_at IS NOT NULL)
    SELECT
      (SELECT count(*) FROM m)::int AS members,
      (SELECT count(*) FROM m WHERE joined_at > now() - interval '7 days')::int AS joined7d,
      (SELECT count(*) FROM users WHERE joined_at IS NULL AND terms_accepted_at IS NOT NULL)::int AS waiting,
      (SELECT count(*) FROM invite_codes)::int AS invites_created,
      (SELECT coalesce(sum(uses), 0) FROM invite_codes)::int AS invites_used,
      (SELECT coalesce(sum(greatest(max_uses - uses, 0)), 0) FROM invite_codes WHERE disabled = 0)::int AS invites_available,
      (SELECT count(*) FROM m WHERE last_seen_at > now() - interval '24 hours')::int AS active24h,
      (SELECT count(*) FROM m WHERE last_seen_at > now() - interval '7 days')::int AS active7d,
      (SELECT count(*) FROM token_comments WHERE deleted_at IS NULL)::int AS lp_ideas,
      (SELECT count(*) FROM token_comments WHERE deleted_at IS NULL AND created_at > now() - interval '7 days')::int AS lp_ideas_7d,
      (SELECT count(*) FROM thesis_likes)::int AS likes,
      (SELECT count(*) FROM follows)::int AS follows,
      (SELECT max(last_synced_at) FROM m) AS last_sync_at,
      (SELECT count(*) FROM m WHERE last_synced_at > now() - interval '30 minutes')::int AS synced_recently,
      (SELECT count(*) FROM m WHERE last_synced_at IS NULL OR last_synced_at < now() - interval '2 hours')::int AS stale,
      (SELECT count(*) FROM m WHERE last_attempted_at IS NOT NULL
         AND (last_synced_at IS NULL OR last_attempted_at > last_synced_at + interval '1 minute'))::int AS failing,
      (SELECT count(*) FROM open_positions o JOIN m ON m.id = o.user_id)::int AS open_pools,
      (SELECT coalesce(sum(coalesce(o.position_count, 1)), 0) FROM open_positions o JOIN m ON m.id = o.user_id)::int AS open_positions,
      (SELECT coalesce(sum(o.value_usd), 0) FROM open_positions o JOIN m ON m.id = o.user_id)::float AS open_value_usd,
      (SELECT count(*) FROM open_positions o JOIN m ON m.id = o.user_id, jsonb_array_elements(coalesce(o.positions, '[]'::jsonb)) e)::int AS position_details,
      (SELECT count(*) FROM open_positions o JOIN m ON m.id = o.user_id, jsonb_array_elements(coalesce(o.positions, '[]'::jsonb)) e
         WHERE e ? 'shape')::int AS positions_with_shape
  `);
  const r = rows[0];
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    growth: {
      members: n("members"),
      cap: betaCap(),
      joined7d: n("joined7d"),
      waiting: n("waiting"),
      invitesCreated: n("invites_created"),
      invitesUsed: n("invites_used"),
      invitesAvailable: n("invites_available"),
    },
    engagement: {
      active24h: n("active24h"),
      active7d: n("active7d"),
      lpIdeas: n("lp_ideas"),
      lpIdeas7d: n("lp_ideas_7d"),
      likes: n("likes"),
      follows: n("follows"),
    },
    health: {
      lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at).toISOString() : null,
      syncedRecently: n("synced_recently"),
      stale: n("stale"),
      failing: n("failing"),
      openPools: n("open_pools"),
      openPositions: n("open_positions"),
      openValueUsd: n("open_value_usd"),
      positionDetails: n("position_details"),
      positionsWithShape: n("positions_with_shape"),
    },
  };
}

/** One day of history: that day's last stats plus the day's sync totals. */
export interface DailyStatsRow {
  date: string;
  stats: AdminStats;
  sync: { runs: number; synced: number; failed: number };
}

/**
 * Called by every sync-all run: rewrite today's (UTC) stats and add this run's sync results to
 * today's counters. Best effort: never fails the sync.
 */
export async function recordDailyStats(run: { synced: number; failed: number }): Promise<void> {
  try {
    const stats = await getAdminStats();
    await getPool().query(
      `INSERT INTO daily_stats (date, stats, sync_runs, sync_synced, sync_failed, updated_at)
       VALUES ((now() AT TIME ZONE 'UTC')::date, $1, 1, $2, $3, now())
       ON CONFLICT (date) DO UPDATE SET
         stats = EXCLUDED.stats,
         sync_runs = daily_stats.sync_runs + 1,
         sync_synced = daily_stats.sync_synced + EXCLUDED.sync_synced,
         sync_failed = daily_stats.sync_failed + EXCLUDED.sync_failed,
         updated_at = now()`,
      [JSON.stringify(stats), run.synced, run.failed]
    );
  } catch (e) {
    console.error("[stats] daily record failed:", e instanceof Error ? e.message : e);
  }
}

/** The last `days` days of history, oldest first. */
export async function getStatsHistory(days: number): Promise<DailyStatsRow[]> {
  const { rows } = await getPool().query<{ date: string; stats: AdminStats; sync_runs: number; sync_synced: number; sync_failed: number }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date, stats, sync_runs, sync_synced, sync_failed
     FROM daily_stats WHERE date > (now() AT TIME ZONE 'UTC')::date - $1::int ORDER BY date`,
    [days]
  );
  return rows.map((r) => ({ date: r.date, stats: r.stats, sync: { runs: r.sync_runs, synced: r.sync_synced, failed: r.sync_failed } }));
}
