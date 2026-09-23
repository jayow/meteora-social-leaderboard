import { NextRequest, NextResponse } from "next/server";
import type { DailyPnL } from "@/lib/types";

const CALENDAR_BASE = "https://portfolio.datapi.meteora.ag";

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
    const calendarRes = await fetch(
      `${CALENDAR_BASE}/chart/calendar/${wallet}?month=${month}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      }
    );

    if (!calendarRes.ok) {
      return NextResponse.json(
        { error: `Meteora calendar ${calendarRes.status}` },
        { status: calendarRes.status }
      );
    }

    const calendarData = await calendarRes.json();
    const dataPoints = Array.isArray(calendarData.data_points) ? calendarData.data_points : [];

    const days: DailyPnL[] = dataPoints.map((point: any) => {
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

    return NextResponse.json({
      wallet,
      month,
      days,
      note: "Live from Meteora portfolio calendar API",
    });
  } catch (error) {
    console.error("calendar route error", error);
    return NextResponse.json({ error: "Failed to fetch calendar" }, { status: 500 });
  }
}
