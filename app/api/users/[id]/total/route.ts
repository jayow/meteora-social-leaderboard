import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/users";
import { fetchMeteora } from "@/lib/meteora-limiter";
import { hasDb } from "@/lib/db";

const METEORA_API_BASE = "https://dlmm.datapi.meteora.ag";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !user.joinedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = `${METEORA_API_BASE}/portfolio/total/${user.wallet}`;
    const data = await fetchMeteora(url, 300000) as Record<string, unknown>;
    // Strip wallet/owner fields from response
    const { wallet: _w, owner: _o, ...cleaned } = data;
    return NextResponse.json(cleaned);
  } catch (error) {
    console.error("Total fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch total" }, { status: 500 });
  }
}
