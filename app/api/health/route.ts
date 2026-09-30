import { NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ ok: true, db: "not configured" });
  try {
    const pool = getPool();
    const tables = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
    );
    const migrations = await pool
      .query<{ n: string }>("select count(*)::text as n from drizzle.__drizzle_migrations")
      .then((r) => Number(r.rows[0]?.n || 0))
      .catch(() => 0);
    const counts = await pool
      .query<{ users: string; snapshots: string }>(
        "select (select count(*) from users)::text as users, (select count(*) from pnl_snapshots)::text as snapshots"
      )
      .then((r) => ({ users: Number(r.rows[0].users), snapshots: Number(r.rows[0].snapshots) }))
      .catch(() => null);
    return NextResponse.json({ ok: true, db: "ok", tables: tables.rows.map((r) => r.table_name), migrations, counts });
  } catch (e) {
    return NextResponse.json({ ok: false, db: "error", error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
