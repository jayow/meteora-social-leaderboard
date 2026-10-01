import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users, userWallets } from "@/lib/db/schema";
import { clearSession, getSessionUserId, getSessionWallet } from "@/lib/session";

export const dynamic = "force-dynamic";

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ userId: null, wallet: null });
  
  const userId = await getSessionUserId();
  if (userId) {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user) {
      const walletRows = await db.select().from(userWallets).where(eq(userWallets.userId, user.id));
      const walletList = [user.wallet, ...walletRows.map((w) => w.address)];
      return NextResponse.json({
        userId: user.id,
        xId: user.xId,
        xHandle: user.xHandle,
        xName: user.xName,
        xAvatarUrl: user.xAvatarUrl,
        memberNumber: user.memberNumber,
        wallets: walletList.map(shortAddr),
      });
    }
  }
  
  // Legacy wallet session
  const wallet = await getSessionWallet();
  return NextResponse.json({ userId: null, wallet });
}

export async function DELETE(): Promise<NextResponse> {
  await clearSession();
  return NextResponse.json({ ok: true });
}
