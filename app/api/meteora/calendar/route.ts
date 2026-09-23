import { NextRequest, NextResponse } from "next/server";
import { aggregateCalendarData } from "@/lib/meteora";

const BASE = "https://dlmm.datapi.meteora.ag";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet parameter required" }, { status: 400 });
  }

  try {
    const poolAddresses = new Set<string>();
    
    let page = 1;
    let hasNextPage = true;
    
    while (hasNextPage) {
      const portfolioRes = await fetch(
        `${BASE}/portfolio?user=${wallet}&page=${page}&page_size=50&days_back=365`,
        {
          headers: { Accept: "application/json" },
          next: { revalidate: 60 },
        }
      );

      if (!portfolioRes.ok) {
        if (page === 1) {
          return NextResponse.json(
            { error: `Meteora portfolio ${portfolioRes.status}` },
            { status: portfolioRes.status }
          );
        }
        break;
      }

      const portfolioData = await portfolioRes.json();
      const pools = Array.isArray(portfolioData.pools) ? portfolioData.pools : [];
      
      for (const pool of pools) {
        if (pool.poolAddress) {
          poolAddresses.add(pool.poolAddress);
        }
      }

      hasNextPage = portfolioData.hasNext === true;
      page++;
    }

    const allPositions: Array<{
      positionAddress: string;
      isClosed: boolean;
      closedAt?: number;
      pnlUsd?: string | number;
    }> = [];
    
    for (const poolAddr of Array.from(poolAddresses)) {
      let poolPage = 1;
      let poolHasNext = true;
      
      while (poolHasNext) {
        const pnlRes = await fetch(
          `${BASE}/positions/${poolAddr}/pnl?user=${wallet}&page=${poolPage}&page_size=50`,
          {
            headers: { Accept: "application/json" },
            next: { revalidate: 60 },
          }
        );
        
        if (!pnlRes.ok) {
          break;
        }
        
        const pnlData = await pnlRes.json();
        const positions = Array.isArray(pnlData.positions) ? pnlData.positions : [];
        allPositions.push(...positions);
        
        poolHasNext = pnlData.hasNext === true;
        poolPage++;
      }
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
