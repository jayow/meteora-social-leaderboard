import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { isAdminUser } from "@/lib/invite";

/**
 * Who may READ metrics (stats, events, per-user metrics): an admin session, or a request with
 * `Authorization: Bearer $METRICS_TOKEN` (read-only; separate from CRON_SECRET, which can trigger
 * syncs). Everyone else must get a 404 so the endpoints don't reveal they exist.
 */
export async function canReadMetrics(req: NextRequest): Promise<boolean> {
  const token = process.env.METRICS_TOKEN;
  const header = req.headers.get("authorization");
  if (token && token.length >= 24 && header) {
    const a = Buffer.from(header);
    const b = Buffer.from(`Bearer ${token}`);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return isAdminUser(await getSessionUser());
}
