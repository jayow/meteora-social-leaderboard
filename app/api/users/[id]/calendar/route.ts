import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { findUser } from "@/lib/users";
import { fetchMeteora } from "@/lib/meteora-limiter";
import { getDb, hasDb } from "@/lib/db";
import { userWallets } from "@/lib/db/schema";

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
    // Fetch all user wallets
    const db = getDb();
    const wallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));

    if (wallets.length === 0) {
      return NextResponse.json({ days: [] });
    }

    const now = new Date();
    const isPastMonth = month < now.toISOString().slice(0, 7);
    const ttl = isPastMonth ? 3600000 : 120000;
    
    // Fetch calendar data for all wallets in parallel
    const calendarDataList = await Promise.all(
      wallets.map(async (w) => {
        const url = `${CALENDAR_BASE}/chart/calendar/${w.address}?month=${month}`;
        try {
          return await fetchMeteora(url, ttl) as { data_points?: Array<{ date_time: string; pnl_usd: string; closed_position_count: number }> };
        } catch {
          return { data_points: [] };
        }
      })
    );

    // Aggregate data points by date across all wallets
    const dayMap = new Map<string, { pnl: number; positions: number }>();
    
    for (const data of calendarDataList) {
      const points = data.data_points || [];
      for (const point of points) {
        const date = point.date_time.slice(0, 10);
        const pnl = parseFloat(point.pnl_usd || "0");
        const positions = point.closed_position_count || 0;
        
        const existing = dayMap.get(date);
        if (existing) {
          existing.pnl += pnl;
          existing.positions += positions;
        } else {
          dayMap.set(date, { pnl, positions });
        }
      }
    }

    // Convert map to array and sort by date
    const days = Array.from(dayMap.entries())
      .map(([date, data]) => ({
        date,
        pnl: data.pnl,
        positions: data.positions,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return NextResponse.json({ days });
  } catch (error) {
    console.error("Calendar fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}
