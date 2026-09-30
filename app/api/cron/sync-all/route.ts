import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users, type UserRow } from "@/lib/db/schema";
import { syncUser, type SyncResult } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 4;
const BATCH_DELAY_MS = 500;
const STALE_HOURS = 20;
const MAX_USERS_PER_RUN = 50;
const MAX_RETRIES = 3;

// Module-level lock to prevent overlapping runs
let runInProgress = false;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncWithRetry(user: UserRow, attempt = 1): Promise<SyncResult> {
  try {
    const result = await syncUser(user);
    if (!result.ok) {
      // syncUser returned error; throw to trigger retry
      throw new Error(result.error || "Sync failed");
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isRateLimit = message.includes("429") || message.toLowerCase().includes("rate limit");
    const isServerError = /5\d\d/.test(message) || message.toLowerCase().includes("timeout");
    
    if ((isRateLimit || isServerError) && attempt < MAX_RETRIES) {
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      await sleep(backoffMs);
      return syncWithRetry(user, attempt + 1);
    }
    
    return {
      ok: false,
      wallet: user.wallet,
      date: "",
      error: message,
    };
  }
}

async function runBatch(): Promise<void> {
  if (runInProgress) {
    console.log("[cron] Run already in progress, skipping");
    return;
  }

  runInProgress = true;
  const started = Date.now();

  try {
    if (!hasDb()) {
      console.error("[cron] Database not configured");
      return;
    }

    const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
    
    const db = getDb();
    const staleUsers = await db
      .select()
      .from(users)
      .where(
        sql`${users.joinedAt} IS NOT NULL AND (${users.lastAttemptedAt} IS NULL OR ${users.lastAttemptedAt} < ${staleThreshold})`
      )
      .orderBy(sql`COALESCE(${users.lastAttemptedAt}, ${users.lastSyncedAt}) ASC NULLS FIRST`)
      .limit(MAX_USERS_PER_RUN);

    if (staleUsers.length === 0) {
      console.log("[cron] All users recently synced");
      return;
    }

    let ok = 0;
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
          // Update last_attempted_at for failed users
          await db.update(users).set({ lastAttemptedAt: sql`now()` }).where(sql`wallet = ${r.wallet}`);
        }
      }
      
      if (i + CONCURRENCY < staleUsers.length) {
        await sleep(BATCH_DELAY_MS);
      }
      
      // Time budget: ~4.5 minutes
      if (Date.now() - started > 270000) {
        console.log("[cron] Time budget exceeded, stopping");
        break;
      }
    }

    console.log(`[cron] Completed: ${ok} ok, ${failed.length} failed, ${Date.now() - started}ms`);
  } finally {
    runInProgress = false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  // Fire and forget
  void runBatch();
  
  return NextResponse.json({ status: "started" }, { status: 202 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  // Fire and forget
  void runBatch();
  
  return NextResponse.json({ status: "started" }, { status: 202 });
}
