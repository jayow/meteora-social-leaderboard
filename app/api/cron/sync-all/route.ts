import { NextRequest, NextResponse } from "next/server";
import { asc, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users, type UserRow } from "@/lib/db/schema";
import { syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 4;
const BATCH_DELAY_MS = 500;
const STALE_HOURS = 20;
const MAX_USERS_PER_RUN = 150;
const MAX_RETRIES = 3;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncWithRetry(user: UserRow, attempt = 1): Promise<{ ok: boolean; wallet: string; error?: string }> {
  try {
    const result = await syncUser(user);
    return result;
  } catch (error) {
    const isRateLimit = error instanceof Error && (error.message.includes("429") || error.message.includes("rate limit"));
    const isServerError = error instanceof Error && (error.message.includes("5") || error.message.includes("timeout"));
    
    if ((isRateLimit || isServerError) && attempt < MAX_RETRIES) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await sleep(backoffMs);
      return syncWithRetry(user, attempt + 1);
    }
    
    return {
      ok: false,
      wallet: user.wallet,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function run(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
  
  const db = getDb();
  const staleUsers = await db
    .select()
    .from(users)
    .where(
      or(
        isNull(users.lastSyncedAt),
        lt(users.lastSyncedAt, staleThreshold)
      )
    )
    .orderBy(asc(users.lastSyncedAt))
    .limit(MAX_USERS_PER_RUN);

  if (staleUsers.length === 0) {
    return NextResponse.json({ 
      users: 0, 
      ok: 0, 
      skipped: 0, 
      failed: [], 
      message: "All users recently synced",
      ms: 0 
    });
  }

  const started = Date.now();
  let ok = 0;
  let skipped = 0;
  const failed: Array<{ wallet: string; error: string }> = [];

  for (let i = 0; i < staleUsers.length; i += CONCURRENCY) {
    const batch = staleUsers.slice(i, i + CONCURRENCY);
    
    const results = await Promise.all(
      batch.map((u) => syncWithRetry(u))
    );
    
    for (const r of results) {
      if (r.ok) {
        ok++;
      } else {
        failed.push({ wallet: r.wallet, error: r.error || "Unknown" });
      }
    }
    
    if (i + CONCURRENCY < staleUsers.length) {
      await sleep(BATCH_DELAY_MS);
    }
    
    if (Date.now() - started > 280000) {
      skipped = staleUsers.length - (i + batch.length);
      break;
    }
  }

  const totalUsers = await db.select({ count: sql<number>`count(*)::int` }).from(users);

  return NextResponse.json({
    totalUsers: totalUsers[0]?.count ?? 0,
    processed: ok + failed.length,
    ok,
    failed: failed.length,
    skipped,
    failedDetails: failed.slice(0, 10),
    ms: Date.now() - started,
    staleThreshold: staleThreshold.toISOString(),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return run(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return run(req);
}
