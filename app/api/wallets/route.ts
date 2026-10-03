import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users, userWallets } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import { verifyWalletProof } from "@/lib/wallet-proof";
import { trackEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

// GET /api/wallets - List user's wallets (owner only)
export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ wallets: [] });
  
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = getDb();
  const wallets = await db
    .select()
    .from(userWallets)
    .where(eq(userWallets.userId, user.id))
    .orderBy(sql`${userWallets.isPrimary} DESC, ${userWallets.createdAt} ASC`);

  return NextResponse.json({
    wallets: wallets.map((w) => ({
      id: w.id,
      address: w.address,
      label: w.label,
      isPrimary: Boolean(w.isPrimary),
      createdAt: w.createdAt.toISOString(),
    })),
  });
}

interface AddWalletBody {
  label?: string;
  proof?: unknown;
}

// POST /api/wallets - Add a wallet (requires signature proof of ownership)
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = getDb();
  let body: AddWalletBody = {};
  try {
    body = (await req.json()) as AddWalletBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { label } = body;
  // Proof of ownership: a Sign-In With Solana signature for this site and a fresh nonce.
  const proof = await verifyWalletProof(req, body.proof);
  if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: proof.status });
  const address = proof.address;

  // Check wallet limit (max 5 per user)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userWallets)
    .where(eq(userWallets.userId, user.id));

  if (count >= 5) {
    return NextResponse.json({ error: "Maximum 5 wallets per user" }, { status: 400 });
  }

  // Check if wallet already belongs to another user
  const [existing] = await db
    .select()
    .from(userWallets)
    .where(eq(userWallets.address, address))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "Wallet already linked to an account" }, { status: 409 });
  }

  // Add wallet
  const [added] = await db
    .insert(userWallets)
    .values({
      userId: user.id,
      address,
      label: label || null,
      isPrimary: 0,
    })
    .returning();
  // Re-run the closed-position backfill so the added wallet's past year is filled in.
  await db.update(users).set({ closedBackfillAt: null, closedBackfillCursor: 0 }).where(eq(users.id, user.id));

  trackEvent("wallet_add", user.id);
  return NextResponse.json({
    ok: true,
    wallet: {
      id: added.id,
      address: added.address,
      label: added.label,
      isPrimary: Boolean(added.isPrimary),
      createdAt: added.createdAt.toISOString(),
    },
  });
}
