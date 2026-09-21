import { NextRequest, NextResponse } from "next/server";

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
    const response = await fetch(
      `${METEORA_API_BASE}/portfolio/total?user=${wallet}`,
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
    console.error("Error fetching total portfolio:", error);
    return NextResponse.json(
      { error: "Failed to fetch total portfolio" },
      { status: 500 }
    );
  }
}
