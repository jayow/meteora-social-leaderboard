import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { clearSession, getSessionUserId, getSessionWallet } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ userId: null, wallet: null });
  
  const userId = await getSessionUserId();
  if (userId) {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user) {
      return NextResponse.json({
        userId: user.id,
        xId: user.xId,
        xHandle: user.xHandle,
        xName: user.xName,
        xAvatarUrl: user.xAvatarUrl,
        wallet: null, // Legacy field, kept for compat
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
