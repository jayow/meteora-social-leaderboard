import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users, userWallets } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import { isValidWallet } from "@/lib/wallet";
import { verifyWalletSignature, loginMessage } from "@/lib/session";

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
  address?: string;
  label?: string;
  signature?: string;
  issuedAt?: string;
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

  const { address, label, signature, issuedAt } = body;
  if (!isValidWallet(address) || !signature || !issuedAt) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  const ts = Date.parse(issuedAt);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
    return NextResponse.json({ error: "Signature expired" }, { status: 400 });
  }

  // Verify signature (proof of ownership)
  if (!verifyWalletSignature(address, loginMessage(address, issuedAt), signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

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
