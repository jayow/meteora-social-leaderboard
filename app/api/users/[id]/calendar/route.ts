import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/users";
import { fetchMeteora } from "@/lib/meteora-limiter";
import { hasDb } from "@/lib/db";

const CALENDAR_BASE = "https://portfolio.datapi.meteora.ag";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !user.joinedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const month = req.nextUrl.searchParams.get("month") || "";
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month parameter (use YYYY-MM)" }, { status: 400 });
  }

  try {
    const url = `${CALENDAR_BASE}/chart/calendar/${user.wallet}?month=${month}`;
    const now = new Date();
    const isPastMonth = month < now.toISOString().slice(0, 7);
    const ttl = isPastMonth ? 3600000 : 120000;
    
    const data = await fetchMeteora(url, ttl) as Record<string, unknown>;
    
    // Strip wallet/owner fields from response
    const { wallet: _w, owner: _o, ...cleaned } = data;
    return NextResponse.json(cleaned);
  } catch (error) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}
