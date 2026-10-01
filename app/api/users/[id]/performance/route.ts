import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/users";
import { canViewUser } from "@/lib/visibility";
import { fetchMeteora } from "@/lib/meteora-limiter";
import { hasDb } from "@/lib/db";

const METEORA_API_BASE = "https://dlmm.datapi.meteora.ag";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !(await canViewUser(user))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const range = req.nextUrl.searchParams.get("range") || "30d";
  if (!["7d", "30d", "all"].includes(range)) {
    return NextResponse.json({ error: "Invalid range (use 7d, 30d, or all)" }, { status: 400 });
  }

  try {
    const url = `${METEORA_API_BASE}/portfolio/performance/${user.wallet}?range=${range}`;
    const data = await fetchMeteora(url, 120000) as Record<string, unknown>;
    // Strip wallet/owner fields from response
    const { wallet: _w, owner: _o, ...cleaned } = data;
    return NextResponse.json(cleaned);
  } catch (error) {
    console.error("Performance fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch performance" }, { status: 500 });
  }
}
