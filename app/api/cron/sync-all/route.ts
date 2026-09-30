import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function run(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const all = await getDb().select().from(users).orderBy(asc(users.lastSyncedAt));
  const started = Date.now();
  let ok = 0;
  const failed: string[] = [];
  const concurrency = 4;
  for (let i = 0; i < all.length; i += concurrency) {
    const batch = all.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((u) => syncUser(u).catch(() => ({ ok: false, wallet: u.wallet }))));
    for (const r of results) {
      if (r.ok) ok++;
      else failed.push(r.wallet);
    }
  }
  return NextResponse.json({ users: all.length, ok, failed, ms: Date.now() - started });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return run(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return run(req);
}
