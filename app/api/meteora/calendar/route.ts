import { NextRequest, NextResponse } from "next/server";
import type { DailyPnL } from "@/lib/types";
import { fetchMeteora } from "@/lib/meteora-limiter";

const CALENDAR_BASE = "https://portfolio.datapi.meteora.ag";

interface MeteoraCalendarDataPoint {
  timestamp: number;
  date_time: string;
  pnl_usd: string | number;
  pnl_sol: string | number;
  closed_position_count: number;
  win_count_usd: number;
  loss_count_usd: number;
  win_count_sol: number;
  loss_count_sol: number;
  win_rate_usd: string | number;
  win_rate_sol: string | number;
  deposit_usd: string | number;
  deposit_sol: string | number;
  withdrawn_usd: string | number;
  withdrawn_sol: string | number;
  fees_earned_usd: string | number;
  fees_earned_sol: string | number;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet parameter required" }, { status: 400 });
  }

  const monthParam = request.nextUrl.searchParams.get("month");
  const now = new Date();
  const month = monthParam || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  try {
    const url = `${CALENDAR_BASE}/chart/calendar/${wallet}?month=${month}`;
    const isPastMonth = month < now.toISOString().slice(0, 7);
    const ttl = isPastMonth ? 3600000 : 120000; // 1h for past months, 2min for current
    
    const calendarData = await fetchMeteora<{ data_points?: MeteoraCalendarDataPoint[] }>(url, ttl);
    const dataPoints = Array.isArray(calendarData.data_points) ? calendarData.data_points : [];

    const days: DailyPnL[] = dataPoints.map((point: MeteoraCalendarDataPoint) => {
      const dateTime = point.date_time || "";
      const date = dateTime.slice(0, 10);
      const pnl = num(point.pnl_usd);
      const positions = num(point.closed_position_count);

      return {
        date,
        pnl,
        positions,
      };
    });

    const maxAge = isPastMonth ? 3600 : 120;
    
    return NextResponse.json(
      {
        wallet,
        month,
        days,
        note: "Live from Meteora portfolio calendar API",
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
        },
      }
    );
  } catch (error) {
    console.error("calendar route error", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}
