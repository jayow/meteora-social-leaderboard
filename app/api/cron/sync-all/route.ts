import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users, type UserRow } from "@/lib/db/schema";
import { syncUser, type SyncResult } from "@/lib/sync";
import { evaluatePodium } from "@/lib/badges/compute";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 4;
const BATCH_DELAY_MS = 500;
// Just under the cron's 15-minute cadence, so every run re-syncs each member.
const STALE_MINUTES = 12;
const MAX_USERS_PER_RUN = 50;
const MAX_RETRIES = 3;
// The run happens inside the request so the caller (Railway sync-cron) sees the outcome.
// Stay well under undici's default 300s headers timeout in the cron's fetch and maxDuration.
const TIME_BUDGET_MS = 200_000;
const MAX_ERRORS_IN_RESPONSE = 20;

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    const message = errorMessage(error);
    const isRateLimit = message.includes("429") || message.toLowerCase().includes("rate limit");
    const isServerError = /\b5\d\d\b/.test(message) || message.toLowerCase().includes("timeout");

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

interface RunSummary {
  status: "completed" | "partial" | "failed" | "skipped";
  candidates: number;
  synced: number;
  failed: number;
  notAttempted: number;
  timedOut: boolean;
  durationMs: number;
  errors: Array<{ wallet: string; error: string }>;
  reason?: string;
  /** Podium badge pass after the sync loop: members currently top 3, and new/upgraded badges. */
  podium?: { checked: number; awarded: number };
}

function shortWallet(wallet: string): string {
  return wallet.length > 10 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
}

function logSummary(s: RunSummary): void {
  const errs = s.errors.map((e) => `${shortWallet(e.wallet)}: ${e.error}`).join("; ");
  const line =
    `[cron] sync-all ${s.status}: synced=${s.synced} failed=${s.failed} notAttempted=${s.notAttempted} ` +
    `candidates=${s.candidates} timedOut=${s.timedOut} durationMs=${s.durationMs}` +
    (s.reason ? ` reason="${s.reason}"` : "") +
    (errs ? ` errors=[${errs}]` : "");
  if (s.status === "failed" || s.failed > 0) console.error(line);
  else console.log(line);
}

async function runBatch(): Promise<RunSummary> {
  const started = Date.now();
  const summary: RunSummary = {
    status: "completed",
    candidates: 0,
    synced: 0,
    failed: 0,
    notAttempted: 0,
    timedOut: false,
    durationMs: 0,
    errors: [],
  };

  try {
    if (!hasDb()) {
      summary.status = "failed";
      summary.reason = "Database not configured";
      return summary;
    }

    const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

    const db = getDb();
    const staleUsers = await db
      .select()
      .from(users)
      .where(
        sql`${users.joinedAt} IS NOT NULL AND (${users.lastAttemptedAt} IS NULL OR ${users.lastAttemptedAt} < ${staleThreshold})`
      )
      .orderBy(sql`COALESCE(${users.lastAttemptedAt}, ${users.lastSyncedAt}) ASC NULLS FIRST`)
      .limit(MAX_USERS_PER_RUN);

    summary.candidates = staleUsers.length;
    if (staleUsers.length === 0) {
      summary.reason = "All users recently synced";
      return summary;
    }

    let processed = 0;
    for (let i = 0; i < staleUsers.length; i += CONCURRENCY) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        summary.timedOut = true;
        break;
      }

      const batch = staleUsers.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map((u) => syncWithRetry(u)));
      processed += batch.length;

      for (const r of results) {
        if (r.ok) {
          summary.synced++;
          continue;
        }
        summary.failed++;
        summary.errors.push({ wallet: r.wallet, error: r.error || "Unknown" });
        // Update last_attempted_at for failed users so they don't block the queue
        try {
          await db.update(users).set({ lastAttemptedAt: sql`now()` }).where(sql`wallet = ${r.wallet}`);
        } catch (error) {
          console.error(`[cron] Failed to mark attempt for ${shortWallet(r.wallet)}: ${errorMessage(error)}`);
        }
      }

      if (i + CONCURRENCY < staleUsers.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    summary.notAttempted = staleUsers.length - processed;
    if (summary.synced === 0 && summary.failed > 0) summary.status = "failed";
    else if (summary.failed > 0 || summary.timedOut) summary.status = "partial";
    return summary;
  } catch (error) {
    summary.status = "failed";
    summary.reason = errorMessage(error);
    return summary;
  } finally {
    summary.durationMs = Date.now() - started;
    logSummary(summary);
  }
}

function statusCode(s: RunSummary): number {
  if (s.status === "skipped") return 409;
  if (s.status === "failed") return 500;
  if (s.status === "partial") return 207; // still 2xx for the cron runner; details in the body/logs
  return 200;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (runInProgress) {
    const skipped: RunSummary = {
      status: "skipped",
      candidates: 0,
      synced: 0,
      failed: 0,
      notAttempted: 0,
      timedOut: false,
      durationMs: 0,
      errors: [],
      reason: "Run already in progress",
    };
    logSummary(skipped);
    return NextResponse.json(skipped, { status: statusCode(skipped) });
  }

  runInProgress = true;
  try {
    const summary = await runBatch();
    // Podium badges from the current 30D ranks, every run (even when nobody was stale).
    if (hasDb()) {
      const podium = await evaluatePodium({ announce: true });
      summary.podium = { checked: podium.checked, awarded: podium.awarded.length };
    }
    const body: RunSummary = { ...summary, errors: summary.errors.slice(0, MAX_ERRORS_IN_RESPONSE) };
    return NextResponse.json(body, { status: statusCode(summary), headers: { "Cache-Control": "no-store" } });
  } finally {
    runInProgress = false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req);
}
