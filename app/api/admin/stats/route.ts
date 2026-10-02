import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { isAdminUser } from "@/lib/invite";
import { getAdminStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Bearer CRON_SECRET, so monitoring scripts can poll without a browser session. */
function hasMonitorSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Admin stats as JSON (lib/stats.ts): growth, engagement and data health. Counts only. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasMonitorSecret(req) && !isAdminUser(await getSessionUser())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const stats = await getAdminStats();
  return NextResponse.json({ ...stats, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
