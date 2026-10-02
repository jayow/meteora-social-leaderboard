import { NextRequest, NextResponse } from "next/server";
import { canReadMetrics } from "@/lib/metrics-auth";
import { getAdminStats, getStatsHistory } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * Admin stats as JSON (lib/stats.ts): growth, engagement and data health, counts only.
 * `?days=N` (1-365) adds `history`: one row per UTC day, oldest first.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await canReadMetrics(req))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stats = await getAdminStats();
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.min(365, Math.max(1, Math.floor(Number(daysParam)) || 1)) : 0;
  const history = days ? await getStatsHistory(days) : undefined;
  return NextResponse.json({ ...stats, ...(history ? { history } : {}), generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
