import { getPool } from "@/lib/db";
import { recordActivities } from "@/lib/activity";
import { HAS_DATA_SQL, LEADERBOARD_COLS, boardOrderSql } from "@/lib/leaderboard-rank";
import {
  BADGE_THRESHOLDS,
  PODIUM_TABS,
  badgeActivityKey,
  clampTier,
  isBadgeId,
  isPodiumTab,
  sortBadges,
  type ApiBadge,
  type BadgeId,
  type BadgeTier,
  type PodiumTab,
} from "@/lib/badges/config";

/**
 * Badge computation and storage. Rules (see lib/badges/config.ts for thresholds):
 * - Members only: writes are skipped unless users.joined_at is set; reads only return joined users.
 * - Permanent: a badge is never removed; a higher tier upgrades it, a lower one is ignored.
 * - Inputs are metrics we already store: the latest pnl_snapshots row (Meteora), the distinct-pool
 *   count saved by the sync (snapshot source.distinctPools, from Meteora's portfolio) and pools we
 *   have seen in open_positions / position activity. Podium uses the leaderboard's own 30D ranks.
 * - Never throws into callers (sync, join, cron): failures are logged and skipped.
 */

export interface BadgeMetrics {
  positionsClosed: number | null;
  feesUsd: number | null;
  volumeUsd: number | null;
  winRate: number | null;
  totalPnlUsd: number | null;
  distinctPools: number | null;
  /** DLMM pools created (created_pools). */
  poolsCreated: number | null;
}

type Evidence = Record<string, string | number>;

export interface BadgeAward {
  badge: BadgeId;
  tier: BadgeTier;
  evidence: Evidence;
}

/** Highest tier whose threshold `value` reaches (0 = none). */
function tierFor(value: number | null, thresholds: readonly number[]): number {
  if (value == null || !Number.isFinite(value)) return 0;
  let tier = 0;
  thresholds.forEach((t, i) => {
    if (value >= t) tier = i + 1;
  });
  return tier;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pure: which metric badges these numbers earn right now (Podium is evaluated separately). */
export function evaluateBadges(m: BadgeMetrics): BadgeAward[] {
  const t = BADGE_THRESHOLDS;
  const closed = m.positionsClosed ?? 0;
  const out: BadgeAward[] = [];

  if (closed >= t.firstSplash.minClosed) out.push({ badge: "first_splash", tier: 1, evidence: { positionsClosed: closed } });

  const fees = tierFor(m.feesUsd, t.feeFarmerUsd);
  if (fees > 0 && m.feesUsd != null) {
    out.push({ badge: "fee_farmer", tier: clampTier(fees), evidence: { feesUsd: round2(m.feesUsd), threshold: t.feeFarmerUsd[fees - 1] } });
  }

  const vol = tierFor(m.volumeUsd, t.whaleVolumeUsd);
  if (vol > 0 && m.volumeUsd != null) {
    out.push({ badge: "whale_volume", tier: clampTier(vol), evidence: { volumeUsd: round2(m.volumeUsd), threshold: t.whaleVolumeUsd[vol - 1] } });
  }

  if (m.winRate != null && m.winRate >= t.sharpshooter.minWinRate && closed >= t.sharpshooter.minClosed) {
    out.push({ badge: "sharpshooter", tier: 1, evidence: { winRate: Math.round(m.winRate * 10000) / 10000, positionsClosed: closed } });
  }

  if (m.totalPnlUsd != null && m.totalPnlUsd > 0 && closed >= t.inTheGreen.minClosed) {
    out.push({ badge: "in_the_green", tier: 1, evidence: { totalPnlUsd: round2(m.totalPnlUsd), positionsClosed: closed } });
  }

  const pools = tierFor(m.distinctPools, t.poolHopperPools);
  if (pools > 0 && m.distinctPools != null) {
    out.push({ badge: "pool_hopper", tier: clampTier(pools), evidence: { distinctPools: m.distinctPools, threshold: t.poolHopperPools[pools - 1] } });
  }

  const built = tierFor(m.poolsCreated, t.poolBuilderPools);
  if (built > 0 && m.poolsCreated != null) {
    out.push({ badge: "pool_builder", tier: clampTier(built), evidence: { poolsCreated: m.poolsCreated, threshold: t.poolBuilderPools[built - 1] } });
  }

  return out;
}

/**
 * Store awards for one member. Inserts new badges and upgrades lower tiers; never downgrades. Returns
 * the awards that were new or upgraded. With `announce`, the most notable one becomes a Poolside
 * "badge" event (one per call).
 */
export async function awardBadges(userId: number, awards: BadgeAward[], opts: { announce: boolean }): Promise<BadgeAward[]> {
  if (awards.length === 0 || !process.env.DATABASE_URL) return [];
  const changed: BadgeAward[] = [];
  try {
    const pool = getPool();
    for (const a of awards) {
      const { rowCount } = await pool.query(
        `INSERT INTO user_badges (user_id, badge, tier, evidence)
         SELECT u.id, $2, $3, $4::jsonb FROM users u WHERE u.id = $1 AND u.joined_at IS NOT NULL
         ON CONFLICT (user_id, badge) DO UPDATE
           SET tier = EXCLUDED.tier, evidence = EXCLUDED.evidence, tier_earned_at = now()
           WHERE user_badges.tier < EXCLUDED.tier`,
        [userId, a.badge, a.tier, JSON.stringify(a.evidence)]
      );
      if (rowCount) changed.push(a);
    }
    // One Poolside row per call at most (the most notable change), so a sync never floods the feed.
    const top = opts.announce ? sortBadges(changed.map((a) => ({ ...a, id: a.badge })))[0] : undefined;
    if (top) {
      await recordActivities([{ actorUserId: userId, kind: "badge", dedupeKey: badgeActivityKey(userId, top.badge, top.tier) }]);
    }
  } catch (err: unknown) {
    console.error("[badges] award failed:", err instanceof Error ? err.message : err);
  }
  return changed;
}

interface MetricsRow {
  positions_closed: number | null;
  fees_usd: number | null;
  volume_usd: number | null;
  win_rate: number | null;
  total_pnl_usd: number | null;
  source_pools: number | null;
  db_pools: number;
  pools_created: number;
}

/**
 * Metrics for one user from our DB: the latest snapshot plus distinct pools LP'd, the larger of the
 * sync's Meteora portfolio pool count and pools we've seen (open positions, position activity).
 */
export async function metricsFromDb(userId: number): Promise<BadgeMetrics> {
  const { rows } = await getPool().query<MetricsRow>(
    `SELECT s.positions_closed, s.fees_usd, s.volume_usd, s.win_rate, s.total_pnl_usd,
            CASE WHEN jsonb_typeof(s.source -> 'distinctPools') = 'number'
                 THEN (s.source ->> 'distinctPools')::numeric::int END AS source_pools,
            (SELECT count(*)::int FROM (
               SELECT pool_address FROM open_positions WHERE user_id = $1
               UNION
               SELECT pool_address FROM activity
               WHERE actor_user_id = $1 AND kind IN ('opened', 'closed', 'big_win') AND pool_address IS NOT NULL
             ) p) AS db_pools,
            (SELECT count(*)::int FROM created_pools WHERE user_id = $1) AS pools_created
     FROM (SELECT 1) one
     LEFT JOIN LATERAL (SELECT * FROM pnl_snapshots WHERE user_id = $1 ORDER BY date DESC LIMIT 1) s ON true`,
    [userId]
  );
  const r = rows[0];
  return {
    positionsClosed: r?.positions_closed ?? null,
    feesUsd: r?.fees_usd ?? null,
    volumeUsd: r?.volume_usd ?? null,
    winRate: r?.win_rate ?? null,
    totalPnlUsd: r?.total_pnl_usd ?? null,
    distinctPools: Math.max(r?.source_pools ?? 0, r?.db_pools ?? 0) || null,
    poolsCreated: r?.pools_created ?? null,
  };
}

/** Recompute metric badges for one member from stored data (sync, join, backfill). Never throws. */
export async function refreshBadges(userId: number, opts: { announce: boolean }): Promise<BadgeAward[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await awardBadges(userId, evaluateBadges(await metricsFromDb(userId)), opts);
  } catch (err: unknown) {
    console.error("[badges] refresh failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Podium: everyone currently in the top 3 of a 30D leaderboard tab (same ranking SQL as
 * /api/leaderboard, whole board, members only, ranked members with a value for that metric).
 * Tier = best finish (1st = 3 gold, 2nd = 2 silver, 3rd = 1 bronze). Run from the hourly cron.
 */
export async function evaluatePodium(opts: { announce: boolean }): Promise<{ checked: number; awarded: BadgeAward[] }> {
  const awarded: BadgeAward[] = [];
  if (!process.env.DATABASE_URL) return { checked: 0, awarded };
  try {
    const best = new Map<number, { tab: PodiumTab; rank: number; date: string }>();
    for (const tab of PODIUM_TABS) {
      const { rows } = await getPool().query<{ user_id: number; date: string; pos: number }>(
        `WITH latest AS (
           SELECT DISTINCT ON (user_id) * FROM pnl_snapshots ORDER BY user_id, date DESC
         ), ranked AS (
           SELECT s.user_id, s.date::text AS date, ${HAS_DATA_SQL} AS has_data, ${LEADERBOARD_COLS["30d"][tab]} AS metric,
                  row_number() OVER (ORDER BY ${boardOrderSql("30d", tab)}) AS pos
           FROM latest s JOIN users u ON u.id = s.user_id
           WHERE u.joined_at IS NOT NULL
         )
         SELECT user_id, date, pos::int AS pos FROM ranked
         WHERE has_data AND metric IS NOT NULL AND pos <= $1
         ORDER BY pos`,
        [BADGE_THRESHOLDS.podium.maxRank]
      );
      for (const r of rows) {
        const prev = best.get(r.user_id);
        if (!prev || r.pos < prev.rank) best.set(r.user_id, { tab, rank: r.pos, date: r.date });
      }
    }
    for (const [userId, b] of best) {
      const award: BadgeAward = { badge: "podium", tier: clampTier(4 - b.rank), evidence: { tab: b.tab, rank: b.rank, date: b.date } };
      awarded.push(...(await awardBadges(userId, [award], opts)));
    }
    return { checked: best.size, awarded };
  } catch (err: unknown) {
    console.error("[badges] podium pass failed:", err instanceof Error ? err.message : err);
    return { checked: 0, awarded };
  }
}

interface BadgeRow {
  user_id: number;
  badge: string;
  tier: number;
  evidence: unknown;
  earned_at: Date;
}

function podiumEvidence(e: unknown): ApiBadge["podium"] {
  if (!e || typeof e !== "object") return null;
  const { tab, rank, date } = e as Record<string, unknown>;
  return isPodiumTab(tab) && typeof rank === "number" && typeof date === "string" ? { tab, rank, date } : null;
}

/** Badges per user id (joined members only), display-sorted. Missing ids map to nothing. */
export async function listBadges(userIds: number[]): Promise<Map<number, ApiBadge[]>> {
  const out = new Map<number, ApiBadge[]>();
  if (userIds.length === 0 || !process.env.DATABASE_URL) return out;
  const { rows } = await getPool().query<BadgeRow>(
    `SELECT b.user_id, b.badge, b.tier, b.evidence, b.earned_at
     FROM user_badges b JOIN users u ON u.id = b.user_id AND u.joined_at IS NOT NULL
     WHERE b.user_id = ANY($1::int[])`,
    [userIds]
  );
  for (const r of rows) {
    if (!isBadgeId(r.badge)) continue;
    const list = out.get(r.user_id) ?? [];
    list.push({
      id: r.badge,
      tier: clampTier(r.tier),
      earnedAt: new Date(r.earned_at).toISOString(),
      ...(r.badge === "podium" ? { podium: podiumEvidence(r.evidence) } : {}),
    });
    out.set(r.user_id, list);
  }
  for (const [id, list] of out) out.set(id, sortBadges(list));
  return out;
}
