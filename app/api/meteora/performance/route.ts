import { NextRequest, NextResponse } from "next/server";

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

  if (!["30d", "all"].includes(timeRange)) {
    return NextResponse.json(
      { error: "time_range must be 30d or all" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `${METEORA_PORTFOLIO_API_BASE}/performances/${wallet}?time_range=${timeRange}`,
      {
        headers: {
          Accept: "application/json",
        },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) {
      throw new Error(`Meteora API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching performance:", error);
    return NextResponse.json(
      { error: "Failed to fetch performance" },
      { status: 500 }
    );
  }
}
