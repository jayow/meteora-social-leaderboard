import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isCountryCode } from "@/lib/countries";
import { isValidWallet } from "@/lib/wallet";
import { findUserByWallet, toPublicUser, upsertUser } from "@/lib/users";
import { getSessionUserId } from "@/lib/session";
import { syncUser } from "@/lib/sync";

export const dynamic = "force-dynamic";

interface RegisterBody {
  wallet?: string;
  // Operator-only fields (require Authorization: Bearer CRON_SECRET)
  xId?: string;
  xHandle?: string;
  xName?: string;
  xAvatarUrl?: string;
  country?: string;
  thesis?: string;
}

function isOperator(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Refresh the signed-in user's Meteora stats for one of their wallets. Never creates an account:
 * accounts come from a real sign-in (/api/auth/wallet, X OAuth) and join. Wallets that aren't the
 * caller's own get the same `{ user: null }` answer whether or not an account exists, so this can't
 * be used to map wallets to accounts. The operator (Authorization: Bearer CRON_SECRET) can still
 * register wallets and set X identity / thesis / country.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  let body: RegisterBody = {};
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    // empty body
  }
  const wallet = body.wallet?.trim();
  if (!isValidWallet(wallet)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });

  const operator = isOperator(req);
  let user = operator
    ? await upsertUser(wallet, body.xHandle ? { xId: body.xId, xHandle: body.xHandle, xName: body.xName, xAvatarUrl: body.xAvatarUrl } : undefined)
    : await findUserByWallet(wallet);
  if (!operator) {
    const sessionUserId = await getSessionUserId();
    if (!user || !sessionUserId || user.id !== sessionUserId) return NextResponse.json({ user: null, synced: false });
  }
  if (!user) return NextResponse.json({ user: null, synced: false });

  if (operator && (body.country !== undefined || body.thesis !== undefined)) {
    const set: { country?: string | null; thesis?: string | null } = {};
    if (body.country !== undefined) set.country = body.country && isCountryCode(body.country) ? body.country.toUpperCase() : null;
    if (body.thesis !== undefined) set.thesis = body.thesis ? body.thesis.slice(0, 1000) : null;
    const rows = await getDb().update(users).set(set).where(eq(users.id, user.id)).returning();
    user = rows[0];
  }
  const fresh = user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < 10 * 60 * 1000;
  const sync = fresh ? null : await syncUser(user).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : "sync failed" }));
  // Only the owner (or operator) gets here; toPublicUser never includes the wallet.
  return NextResponse.json({ user: toPublicUser(user), synced: sync ? sync.ok : "cached" });
}
