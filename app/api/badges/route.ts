import { NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { listBadges, metricsFromDb, type BadgeMetrics } from "@/lib/badges/compute";
import { BADGE_IDS, clampTier, isBadgeId, type ApiBadge, type BadgeId } from "@/lib/badges/config";

export const dynamic = "force-dynamic";

export interface BadgesResponse {
  /** Joined members (the population every count is out of). */
  members: number;
  /** Per badge: members holding it, split by their current tier (index 0 = tier 1). */
  holders: Record<BadgeId, { total: number; tiers: [number, number, number] }>;
  /** The viewer's badges and the stats that drive them (progress toward the next step). */
  mine: { badges: ApiBadge[]; metrics: BadgeMetrics | null } | null;
}

/** GET /api/badges: how many members hold each badge, and the viewer's own badges and progress. */
export async function GET(): Promise<NextResponse<BadgesResponse | { error: string }>> {
  const holders = Object.fromEntries(BADGE_IDS.map((id) => [id, { total: 0, tiers: [0, 0, 0] }])) as BadgesResponse["holders"];
  if (!hasDb()) return NextResponse.json({ members: 0, holders, mine: null });
  try {
    const viewerId = await getSessionUserId();
    const [counts, members, mineBadges, metrics] = await Promise.all([
      getPool().query<{ badge: string; tier: number; n: number }>(
        `SELECT b.badge, b.tier, count(*)::int AS n
         FROM user_badges b JOIN users u ON u.id = b.user_id AND u.joined_at IS NOT NULL
         GROUP BY b.badge, b.tier`
      ),
      getPool().query<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE joined_at IS NOT NULL`),
      viewerId ? listBadges([viewerId]) : Promise.resolve(new Map<number, ApiBadge[]>()),
      viewerId ? metricsFromDb(viewerId).catch(() => null) : Promise.resolve(null),
    ]);
    for (const r of counts.rows) {
      if (!isBadgeId(r.badge)) continue;
      holders[r.badge].total += r.n;
      holders[r.badge].tiers[clampTier(r.tier) - 1] += r.n;
    }
    return NextResponse.json(
      { members: members.rows[0]?.n ?? 0, holders, mine: viewerId ? { badges: mineBadges.get(viewerId) ?? [], metrics } : null },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err: unknown) {
    console.error("[badges] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't load badges" }, { status: 500 });
  }
}
