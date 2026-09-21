import { NextRequest, NextResponse } from "next/server";
import { aggregateCalendarData } from "@/lib/meteora";

const BASE = "https://dlmm.datapi.meteora.ag";
const MAX_POOLS = 50;

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet parameter required" }, { status: 400 });
  }

  try {
    const [openRes, portfolioRes] = await Promise.all([
      fetch(`${BASE}/portfolio/open?user=${wallet}&page_size=50`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      }),
      fetch(`${BASE}/portfolio?user=${wallet}&page_size=50`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      }),
    ]);

    if (!openRes.ok) {
      return NextResponse.json({ error: `Meteora open portfolio ${openRes.status}` }, { status: openRes.status });
    }
    if (!portfolioRes.ok) {
      return NextResponse.json({ error: `Meteora portfolio ${portfolioRes.status}` }, { status: portfolioRes.status });
    }

    const openData = await openRes.json();
    const portfolioData = await portfolioRes.json();
    const openPools = Array.isArray(openData.pools) ? openData.pools : [];
    const allPools = Array.isArray(portfolioData.pools) ? portfolioData.pools : [];
    
    const poolAddresses = new Set<string>();
    for (const pool of openPools) {
      poolAddresses.add(pool.poolAddress);
    }
    for (const pool of allPools) {
      poolAddresses.add(pool.poolAddress);
    }

    const allPositions: Array<{
      positionAddress: string;
      isClosed: boolean;
      closedAt?: number;
      pnlUsd?: string | number;
    }> = [];
    
    for (const poolAddr of Array.from(poolAddresses).slice(0, MAX_POOLS)) {
      const pnlRes = await fetch(`${BASE}/positions/${poolAddr}/pnl?user=${wallet}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      });
      if (!pnlRes.ok) continue;
      const pnlData = await pnlRes.json();
      const positions = Array.isArray(pnlData.positions) ? pnlData.positions : [];
      allPositions.push(...positions);
    }

    const days = aggregateCalendarData([], allPositions);
    
    return NextResponse.json({
      wallet,
      positionCount: allPositions.length,
      closedPositions: allPositions.filter(p => p.isClosed).length,
      days,
      note: "Calendar days show closed position PnL attributed to closedAt date. Position PnL includes all deposits, withdrawals, and fees.",
    });
  } catch (error) {
    console.error("calendar route error", error);
    return NextResponse.json({ error: "Failed to build calendar" }, { status: 500 });
  }
}
