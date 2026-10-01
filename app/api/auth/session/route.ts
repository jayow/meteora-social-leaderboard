import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserWalletAddresses } from "@/lib/users";
import { clearSession, getSessionUserId, getSessionWallet } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Session responses are per-user and may include the owner's full wallet: never cache them. */
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ userId: null, wallet: null }, { headers: PRIVATE_HEADERS });
  
  const userId = await getSessionUserId();
  if (userId) {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user) {
      // Primary + linked wallets, without X-signup temp_ placeholders or duplicates.
      const walletList = await getUserWalletAddresses(user);
      return NextResponse.json({
        userId: user.id,
        xId: user.xId,
        xHandle: user.xHandle,
        xName: user.xName,
        xAvatarUrl: user.xAvatarUrl,
        anonName: user.anonName,
        memberNumber: user.memberNumber,
        // Full primary wallet, for the signed-in owner's own header menu only (never in public APIs).
        wallet: walletList[0] ?? null,
        wallets: walletList.map(shortAddr),
      }, { headers: PRIVATE_HEADERS });
    }
  }
  
  // Legacy wallet session
  const wallet = await getSessionWallet();
  return NextResponse.json({ userId: null, wallet }, { headers: PRIVATE_HEADERS });
}

export async function DELETE(): Promise<NextResponse> {
  await clearSession();
  return NextResponse.json({ ok: true });
}
