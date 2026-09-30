import { NextRequest, NextResponse } from "next/server";
import { fetchMeteora } from "@/lib/meteora-limiter";

const METEORA_PORTFOLIO_API_BASE = "https://portfolio.datapi.meteora.ag";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const wallet = searchParams.get("wallet");
  const timeRange = searchParams.get("time_range") || "30d";

  if (!wallet) {
    return NextResponse.json(
      { error: "wallet parameter required" },
      { status: 400 }
    );
  }

  if (!["7d", "30d", "all"].includes(timeRange)) {
    return NextResponse.json(
      { error: "time_range must be 7d, 30d or all" },
      { status: 400 }
    );
  }

  try {
    const url = `${METEORA_PORTFOLIO_API_BASE}/performances/${wallet}?time_range=${timeRange}`;
    const ttl = timeRange === "all" ? 300000 : 120000; // 5min for all, 2min for 7d/30d
    const data = await fetchMeteora(url, ttl);
    
    const maxAge = timeRange === "all" ? 300 : 120;
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
      },
    });
  } catch (error) {
    console.error("Error fetching performance:", error);
    return NextResponse.json(
      { error: "Failed to fetch performance" },
      { status: 500 }
    );
  }
}
