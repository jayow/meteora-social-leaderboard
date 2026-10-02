import { NextRequest, NextResponse } from "next/server";
import { canReadMetrics } from "@/lib/metrics-auth";
import { getUserMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** Per-account metrics (lib/metrics.ts): dates, invites, activity, positions. No wallets. Admin / METRICS_TOKEN only. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await canReadMetrics(req))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ users: await getUserMetrics() }, { headers: { "Cache-Control": "no-store" } });
}
