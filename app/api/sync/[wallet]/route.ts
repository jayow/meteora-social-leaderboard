import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isValidWallet } from "@/lib/wallet";
import { findUserByWallet, toPublicSnapshot, upsertUser } from "@/lib/users";
import { getSnapshot, syncUser, todayUtc } from "@/lib/sync";
import { getSessionUserId } from "@/lib/session";
import { SYNC_COOLDOWN_MS, SYNC_RETRY_MS } from "@/lib/sync-limits";

export const dynamic = "force-dynamic";

/** Users with an owner-triggered sync in flight (one instance), so repeat clicks can't stack Meteora calls. */
const inFlight = new Set<number>();

function tooSoon(error: string, retryAfterMs: number): NextResponse {
  const secs = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json({ ok: false, error, retryAfter: secs }, { status: 429, headers: { "Retry-After": String(secs) } });
}

async function handle(req: NextRequest, wallet: string): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (!isValidWallet(wallet)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });

  const force = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}` && Boolean(process.env.CRON_SECRET);
  // Sync existing accounts only (primary or linked wallet), and only the signed-in owner's: unknown
  // wallets are never turned into accounts here (only sign-in/join or the operator create users),
  // and unknown vs someone else's wallet get the same answer so wallets can't be mapped to accounts.
  const user = (await findUserByWallet(wallet)) ?? (force ? await upsertUser(wallet) : null);
  const sessionUserId = force ? null : await getSessionUserId();
  if (!user || (!force && user.id !== sessionUserId)) {
    return NextResponse.json({ ok: false, error: "Sign in with this wallet to sync it" }, { status: 404 });
  }
  if (!force && user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < SYNC_COOLDOWN_MS) {
    const snap = await getSnapshot(user.id, todayUtc());
    if (snap) return NextResponse.json({ ok: true, cached: true, snapshot: toPublicSnapshot(snap) });
  }
  if (!force) {
    if (inFlight.has(user.id)) return tooSoon("A sync is already running", SYNC_RETRY_MS);
    // A failed attempt (success also stamps lastAttemptedAt, but is caught by the cooldown above).
    const sinceAttempt = user.lastAttemptedAt ? Date.now() - user.lastAttemptedAt.getTime() : Infinity;
    if (sinceAttempt < SYNC_RETRY_MS) return tooSoon("Last sync failed, try again shortly", SYNC_RETRY_MS - sinceAttempt);
  }

  if (!force) inFlight.add(user.id);
  let result: Awaited<ReturnType<typeof syncUser>>;
  try {
    result = await syncUser(user);
  } finally {
    if (!force) inFlight.delete(user.id);
  }
  if (!result.ok) {
    await getDb().update(users).set({ lastAttemptedAt: sql`now()` }).where(eq(users.id, user.id));
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  const snap = await getSnapshot(user.id, result.date);
  return NextResponse.json({ ok: true, cached: false, snapshot: snap ? toPublicSnapshot(snap) : null });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ wallet: string }> }): Promise<NextResponse> {
  const { wallet } = await ctx.params;
  return handle(req, wallet);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ wallet: string }> }): Promise<NextResponse> {
  const { wallet } = await ctx.params;
  return handle(req, wallet);
}
