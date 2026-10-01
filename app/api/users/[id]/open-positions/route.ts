import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { findUser } from "@/lib/users";
import { canViewUser } from "@/lib/visibility";
import { readOpenPositions } from "@/lib/open-positions";

export const dynamic = "force-dynamic";

/**
 * A user's open positions as of their last sync, one row per pool with how many positions are in it.
 * Same rows the sync derives the snapshot's "Open positions" count from (lib/open-positions.ts), so the
 * profile stat and this list always agree. (This used to fall back to a live Meteora fetch when the rows
 * were older than 30 minutes, which made the list newer than the count next to it.) No wallet data.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  if (!user || !(await canViewUser(user))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const summary = await readOpenPositions(user.id);
  return NextResponse.json(
    {
      positions: summary.pools,
      totalPositions: summary.totalPositions,
      poolCount: summary.poolCount,
      totalValueUsd: summary.totalValueUsd,
      syncedAt: summary.syncedAt,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
