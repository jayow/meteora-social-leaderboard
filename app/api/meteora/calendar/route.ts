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
    const openRes = await fetch(`${BASE}/portfolio/open?user=${wallet}&page_size=50`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!openRes.ok) {
      return NextResponse.json({ error: `Meteora open portfolio ${openRes.status}` }, { status: openRes.status });
    }
    const openData = await openRes.json();
    const pools = Array.isArray(openData.pools) ? openData.pools : [];
    const positionAddrs: string[] = [];
    for (const pool of pools) {
      const list = pool.listPositions || pool.positions || [] || [];
      for (const addr of list) {
        if (positionAddrs.length >= MAX_POSITIONS) break;
        positionAddrs.push(addr);
      }
      if (positionAddrs.length >= MAX_POSITIONS) break;
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
      note: "Calendar days sum claim_fee/claim_reward USD from open-position historical events. Deposits/withdrawals are excluded from PnL.",
    });
  } catch (error) {
    console.error("calendar route error", error);
    return NextResponse.json({ error: "Failed to build calendar" }, { status: 500 });
  }
}
