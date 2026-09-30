import { NextRequest, NextResponse } from "next/server";
import { fetchMeteora } from "@/lib/meteora-limiter";

const METEORA_API_BASE = "https://dlmm.datapi.meteora.ag";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json(
      { error: "wallet parameter required" },
      { status: 400 }
    );
  }

  try {
    const url = `${METEORA_API_BASE}/portfolio?user=${wallet}`;
    const data = await fetchMeteora(url, 120000); // 2min TTL
    
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=240",
      },
    });
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}
