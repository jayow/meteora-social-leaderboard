import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/users";
import { canViewUser } from "@/lib/visibility";
import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

/** Zeroed totals, same shape as Meteora's /portfolio/total, for wallets Meteora has no data for. */
const EMPTY_TOTAL = {
  totalPnlUsd: "0",
  totalPnlSol: "0",
  totalPnlPctChange: "0",
  totalPnlSolPctChange: "0",
  totalClosedPositions: 0,
  noData: true,
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !(await canViewUser(user))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Same endpoint lib/sync.ts uses (primary wallet only, as before)
    const data = await fetchMeteoraOrNull<Json>(meteoraUrls.portfolioTotal(user.wallet), 300000);
    if (!data || typeof data !== "object") return NextResponse.json(EMPTY_TOTAL);
    // Strip wallet/owner fields from response
    const { wallet: _w, owner: _o, ...cleaned } = data;
    void _w;
    void _o;
    return NextResponse.json(cleaned);
  } catch (error) {
    console.error("Total fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch total" }, { status: 500 });
  }
}
