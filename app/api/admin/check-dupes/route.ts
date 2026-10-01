import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasDb()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const pool = getPool();
  const { rows } = await pool.query<{ x_id: string; cnt: number }>(
    "SELECT x_id, count(*) as cnt FROM users WHERE x_id IS NOT NULL GROUP BY x_id HAVING count(*) > 1 ORDER BY cnt DESC"
  );

  return NextResponse.json({ duplicates: rows, count: rows.length });
}
