import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { userWallets, users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/session";
import { verifyWalletProof } from "@/lib/wallet-proof";
import { trackEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

interface Body {
  proof?: unknown;
}

/** An account with nothing in it: never joined, no X, no seed flag, no LP ideas, likes or follows. */
async function isThrowawayAccount(u: typeof users.$inferSelect): Promise<boolean> {
  if (u.joinedAt || u.xId || u.memberNumber || u.seeded) return false;
  const { rows } = await getPool().query<{ n: number }>(
    `SELECT (SELECT count(*) FROM token_comments WHERE user_id = $1)
          + (SELECT count(*) FROM thesis_likes WHERE user_id = $1)
          + (SELECT count(*) FROM follows WHERE follower_user_id = $1 OR followee_user_id = $1)
          + (SELECT count(*) FROM user_wallets WHERE user_id = $1) AS n`,
    [u.id]
  );
  return Number(rows[0]?.n ?? 0) === 0;
}

/** Link a wallet to the current user's account (must be signed in). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const proof = await verifyWalletProof(req, body.proof);
  if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: proof.status });
  const wallet = proof.address;

  const db = getDb();

  // Check if this wallet is already linked to another user
  const [existingWallet] = await db.select().from(userWallets).where(eq(userWallets.address, wallet)).limit(1);
  if (existingWallet && existingWallet.userId !== userId) {
    return NextResponse.json({ error: "This wallet is already linked to another account" }, { status: 409 });
  }

  const [existingPrimary] = await db.select().from(users).where(eq(users.wallet, wallet)).limit(1);
  if (existingPrimary && existingPrimary.id !== userId) {
    // The signer owns this wallet. If its account is an empty throwaway (e.g. an earlier wallet
    // sign-in that never joined), absorb it; a real account (joined, X, posts, follows) is refused.
    if (!(await isThrowawayAccount(existingPrimary))) {
      return NextResponse.json(
        { error: "This wallet already has its own Pool Party account. Sign in with that wallet instead, or link a different one." },
        { status: 409 }
      );
    }
    await db.delete(users).where(eq(users.id, existingPrimary.id));
  }

  // Check if current user already has a wallet
  const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // If user's primary wallet is a temp placeholder, replace it. Clear the sync cooldown so the new
  // wallet's stats load on the next page view instead of up to 5 minutes later, and queue the
  // closed-position backfill so the new wallet's past year is filled in.
  if (currentUser.wallet.startsWith("temp_")) {
    await db
      .update(users)
      .set({ wallet, lastSyncedAt: null, lastAttemptedAt: null, closedBackfillAt: null, closedBackfillCursor: 0 })
      .where(eq(users.id, userId));
    trackEvent("wallet_link", userId, { primary: true });
    return NextResponse.json({ ok: true, message: "Wallet linked successfully" });
  }

  // Otherwise, add to user_wallets
  if (existingWallet) {
    return NextResponse.json({ ok: true, message: "Wallet already linked" });
  }

  await db.insert(userWallets).values({
    userId,
    address: wallet,
    isPrimary: 0,
  });
  await db
    .update(users)
    .set({ lastSyncedAt: null, lastAttemptedAt: null, closedBackfillAt: null, closedBackfillCursor: 0 })
    .where(eq(users.id, userId));

  trackEvent("wallet_link", userId);
  return NextResponse.json({ ok: true, message: "Wallet linked successfully" });
}
