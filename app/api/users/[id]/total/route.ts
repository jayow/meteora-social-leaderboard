import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/users";
import { canViewUser } from "@/lib/visibility";
import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { hasDb } from "@/lib/db";

const METEORA_API_BASE = "https://dlmm.datapi.meteora.ag";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !(await canViewUser(user))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = `${METEORA_API_BASE}/portfolio/total/${user.wallet}`;
    const data = await fetchMeteoraOrNull<Record<string, unknown>>(url, 300000);
    // Meteora 404 = no history for this wallet: zeroed totals instead of an error
    if (!data) return NextResponse.json({ totalPnlUsd: "0", totalPnlSol: "0", totalPnlPctChange: "0", totalPnlSolPctChange: "0", totalClosedPositions: 0, noData: true });
    // Strip wallet/owner fields from response
    const { wallet: _w, owner: _o, ...cleaned } = data;
    return NextResponse.json(cleaned);
  } catch (error) {
    console.error("Total fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch total" }, { status: 500 });
  }
}
