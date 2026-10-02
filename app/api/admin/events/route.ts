import { NextRequest, NextResponse } from "next/server";
import { canReadMetrics } from "@/lib/metrics-auth";
import { getEventsReport } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** Every tracked action, aggregated (lib/metrics.ts). `?days=N` (1-365, default 7). Admin / METRICS_TOKEN only. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await canReadMetrics(req))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const days = Math.min(365, Math.max(1, Math.floor(Number(req.nextUrl.searchParams.get("days") ?? 7)) || 7));
  return NextResponse.json(await getEventsReport(days), { headers: { "Cache-Control": "no-store" } });
}
