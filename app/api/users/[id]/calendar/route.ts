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
    
    const data = await fetchMeteora(url, ttl) as { data_points?: Array<{ date_time: string; pnl_usd: string; closed_position_count: number }> };
    
    // Transform data_points to days format expected by component
    const days = (data.data_points || []).map((point) => ({
      date: point.date_time.slice(0, 10), // Extract YYYY-MM-DD
      pnl: parseFloat(point.pnl_usd || "0"),
      positions: point.closed_position_count || 0,
    }));
    
    return NextResponse.json({ days });
  } catch (error) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}
