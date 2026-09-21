import { NextRequest, NextResponse } from "next/server";
import { aggregateEventsByDay } from "@/lib/meteora";

const BASE = "https://dlmm.datapi.meteora.ag";
const MAX_POSITIONS = 20;

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

    const positionAddrs: string[] = [];
    for (const poolAddr of poolAddresses) {
      if (positionAddrs.length >= MAX_POSITIONS) break;
      const pnlRes = await fetch(`${BASE}/positions/${poolAddr}/pnl?user=${wallet}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      });
      if (!pnlRes.ok) continue;
      const pnlData = await pnlRes.json();
      const positions = Array.isArray(pnlData.positions) ? pnlData.positions : [];
      for (const pos of positions) {
        if (positionAddrs.length >= MAX_POSITIONS) break;
        if (pos.positionAddress) positionAddrs.push(pos.positionAddress);
      }
    }

    const events: unknown[] = [];
    for (const addr of positionAddrs) {
      const hRes = await fetch(`${BASE}/positions/${addr}/historical`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      });
      if (!hRes.ok) continue;
      const hData = await hRes.json();
      if (Array.isArray(hData.events)) events.push(...hData.events);
      else if (Array.isArray(hData)) events.push(...hData);
    }

    const days = aggregateEventsByDay(events as Array<{ blockTime?: number; createdAt?: string; eventType?: string; totalUsd?: string | number }>);
    return NextResponse.json({
      wallet,
      positionCount: positionAddrs.length,
      eventCount: events.length,
      days,
      note: "Calendar days sum claim_fee/claim_reward USD from both open and closed position historical events. Deposits/withdrawals are excluded from PnL.",
    });
  } catch (error) {
    console.error("calendar route error", error);
    return NextResponse.json({ error: "Failed to build calendar" }, { status: 500 });
  }
}
