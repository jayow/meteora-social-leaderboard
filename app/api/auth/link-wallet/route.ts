import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { userWallets, users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/session";
import { verifyWalletProof } from "@/lib/wallet-proof";
import { trackEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

interface Body {
  proof?: unknown;
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
    return NextResponse.json({ error: "This wallet is already linked to another account" }, { status: 409 });
  }

  // Check if current user already has a wallet
  const [currentUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // If user's primary wallet is a temp placeholder, replace it
  if (currentUser.wallet.startsWith("temp_")) {
    await db.update(users).set({ wallet }).where(eq(users.id, userId));
    trackEvent("wallet_link", userId);
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

  trackEvent("wallet_link", userId);
  return NextResponse.json({ ok: true, message: "Wallet linked successfully" });
}
