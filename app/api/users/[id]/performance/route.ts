import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/users";
import { canViewUser } from "@/lib/visibility";
import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { isMeteoraTimeRange, meteoraUrls } from "@/lib/meteora-endpoints";
import { hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type Json = Record<string, unknown>;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !(await canViewUser(user))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const range = req.nextUrl.searchParams.get("range") || "30d";
  if (!isMeteoraTimeRange(range)) {
    return NextResponse.json({ error: "Invalid range (use 7d, 30d, or all)" }, { status: 400 });
  }

  try {
    // Same endpoint lib/sync.ts uses (primary wallet only, as before). Response keeps Meteora's
    // performances shape (pnl_usd, win_rate_usd, total_deposit_usd, ...), as /api/meteora/performance does.
    const ttl = range === "all" ? 300000 : 120000;
    const data = await fetchMeteoraOrNull<Json>(meteoraUrls.performance(user.wallet, range), ttl);
    // Meteora 404 = no history for this wallet: empty result instead of an error
    if (!data || typeof data !== "object") return NextResponse.json({ noData: true });
    // Strip wallet/owner fields from response
    const { wallet: _w, owner: _o, ...cleaned } = data;
    void _w;
    void _o;
    return NextResponse.json(cleaned);
  } catch (error) {
    console.error("Performance fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch performance" }, { status: 500 });
  }
}
