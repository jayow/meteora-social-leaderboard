import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users, userWallets } from "@/lib/db/schema";
import { isCountryCode } from "@/lib/countries";
import { isValidWallet } from "@/lib/wallet";
import { toPublicUser, upsertUser } from "@/lib/users";
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
 * Register a wallet (public Meteora data only). Idempotent upsert, then a best-effort
 * stats sync so the wallet shows up on the leaderboard right away.
 * X identity, thesis and country are only written through verified routes
 * (wallet-signed session, X OAuth callback) or by the operator with CRON_SECRET.
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

  const db = getDb();
  const [linked] = await db.select().from(userWallets).where(eq(userWallets.address, wallet)).limit(1);
  if (linked) {
    const [existingUser] = await db.select().from(users).where(eq(users.id, linked.userId)).limit(1);
    if (existingUser) {
      return NextResponse.json({ user: toPublicUser(existingUser), synced: "cached" });
    }
  }

  let user = await upsertUser(wallet, isOperator(req) && body.xHandle ? { xId: body.xId, xHandle: body.xHandle, xName: body.xName, xAvatarUrl: body.xAvatarUrl } : undefined);
  if (isOperator(req) && (body.country !== undefined || body.thesis !== undefined)) {
    const set: { country?: string | null; thesis?: string | null } = {};
    if (body.country !== undefined) set.country = body.country && isCountryCode(body.country) ? body.country.toUpperCase() : null;
    if (body.thesis !== undefined) set.thesis = body.thesis ? body.thesis.slice(0, 1000) : null;
    const rows = await db.update(users).set(set).where(eq(users.id, user.id)).returning();
    user = rows[0];
  }
  const fresh = user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < 10 * 60 * 1000;
  const sync = fresh ? null : await syncUser(user).catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : "sync failed" }));
  return NextResponse.json({ user: toPublicUser(user), synced: sync ? sync.ok : "cached" });
}
