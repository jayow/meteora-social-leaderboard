import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { findUser } from "@/lib/users";
import { canViewUser } from "@/lib/visibility";
import { readClosedPositions } from "@/lib/closed-positions";

export const dynamic = "force-dynamic";

/** A member's positions closed in the last 30 days (live from Meteora, cached 10 min). No wallet data. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  if (!user || !(await canViewUser(user))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json(await readClosedPositions(user), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load closed positions from Meteora" }, { status: 502 });
  }
}
