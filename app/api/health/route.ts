import { NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Public liveness/readiness probe (Railway healthcheck). Exposes no schema or row counts. */
export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ ok: true, db: "not configured" }, { headers: NO_STORE });
  try {
    await getPool().query("select 1");
    return NextResponse.json({ ok: true, db: "ok" }, { headers: NO_STORE });
  } catch (e) {
    console.error("[health] DB check failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, db: "error" }, { status: 500, headers: NO_STORE });
  }
}
