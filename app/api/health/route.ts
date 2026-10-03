import { NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** The stats cron runs every 15 minutes; no member synced in this long means it has stopped. */
const SYNC_STALE_MINUTES = 45;

/**
 * Public liveness/readiness probe (Railway healthcheck, and the GitHub uptime workflow). Exposes no
 * schema or row counts. `sync` says whether the stats cron is still running; it never changes the
 * status code, so a stalled cron doesn't make Railway treat the web service as unhealthy.
 */
export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ ok: true, db: "not configured" }, { headers: NO_STORE });
  try {
    const { rows } = await getPool().query<{ stale: boolean | null }>(
      `SELECT max(last_synced_at) < now() - make_interval(mins => $1) AS stale FROM users WHERE joined_at IS NOT NULL`,
      [SYNC_STALE_MINUTES]
    );
    const sync = rows[0]?.stale ? "stale" : "ok";
    return NextResponse.json({ ok: true, db: "ok", sync }, { headers: NO_STORE });
  } catch (e) {
    console.error("[health] DB check failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, db: "error" }, { status: 500, headers: NO_STORE });
  }
}
