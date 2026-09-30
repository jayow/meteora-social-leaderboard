import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users, userWallets } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

interface PatchBody {
  label?: string;
  setPrimary?: boolean;
}

// PATCH /api/wallets/[address] - Update wallet (label or set as primary)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { address } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = getDb();
  
  // Verify wallet belongs to this user
  const [wallet] = await db
    .select()
    .from(userWallets)
    .where(and(eq(userWallets.userId, user.id), eq(userWallets.address, address)))
    .limit(1);

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found or not owned by you" }, { status: 404 });
  }

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Partial<typeof userWallets.$inferInsert> = {};

  if (body.label !== undefined) {
    updates.label = body.label || null;
  }

  if (body.setPrimary === true) {
    // Unset other primary wallets first
    await db
      .update(userWallets)
      .set({ isPrimary: 0 })
      .where(eq(userWallets.userId, user.id));
    updates.isPrimary = 1;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, wallet: { id: wallet.id, address: wallet.address, label: wallet.label, isPrimary: Boolean(wallet.isPrimary) } });
  }

  const [updated] = await db
    .update(userWallets)
    .set(updates)
    .where(eq(userWallets.id, wallet.id))
    .returning();

  return NextResponse.json({
    ok: true,
    wallet: {
      id: updated.id,
      address: updated.address,
      label: updated.label,
      isPrimary: Boolean(updated.isPrimary),
      createdAt: updated.createdAt.toISOString(),
    },
  });
}

// DELETE /api/wallets/[address] - Remove wallet (can't remove last wallet)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { address } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = getDb();
  
  // Check wallet count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userWallets)
    .where(eq(userWallets.userId, user.id));

  if (count <= 1) {
    return NextResponse.json({ error: "Cannot remove the last wallet" }, { status: 400 });
  }

  // Verify wallet belongs to this user
  const [wallet] = await db
    .select()
    .from(userWallets)
    .where(and(eq(userWallets.userId, user.id), eq(userWallets.address, address)))
    .limit(1);

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found or not owned by you" }, { status: 404 });
  }

  await db.delete(userWallets).where(eq(userWallets.id, wallet.id));

  // If it was primary, set another one as primary
  if (wallet.isPrimary) {
    const [first] = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    if (first) {
      await db.update(userWallets).set({ isPrimary: 1 }).where(eq(userWallets.id, first.id));
    }
  }

  return NextResponse.json({ ok: true });
}
