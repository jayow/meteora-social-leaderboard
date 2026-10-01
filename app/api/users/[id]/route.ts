import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { findUser, getFollowCounts, getUserWalletCount, isUserFollowing, latestSnapshot, toPublicSnapshot, toPublicUser } from "@/lib/users";
import { getSessionUserId, getSessionWallet } from "@/lib/session";
import { isCountryCode } from "@/lib/countries";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  // Supports both user-id sessions (current) and legacy wallet sessions.
  const currentUserId = await getSessionUserId();
  const isOwnProfile = Boolean(user && currentUserId === user.id);
  // Not-yet-joined accounts are only visible to their owner (see lib/visibility.ts).
  if (!user || (!user.joinedAt && !isOwnProfile)) return NextResponse.json({ user: null }, { status: 404 });

  const snap = await latestSnapshot(user.id);
  const counts = await getFollowCounts(user.id);
  const walletCount = await getUserWalletCount(user.id);

  const isFollowing = await isUserFollowing(currentUserId, user.id);
  
  const publicUser = {
    ...toPublicUser(user, isOwnProfile),
    followersCount: counts.followersCount,
    followingCount: counts.followingCount,
    isFollowing,
    walletCount,
  };
  
  return NextResponse.json({ user: publicUser, snapshot: snap ? toPublicSnapshot(snap) : null });
}

interface PatchBody {
  thesis?: string | null;
  country?: string | null;
  unlinkX?: boolean;
}

/** Update your own profile. Requires a verified wallet session (signed message). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const sessionWallet = await getSessionWallet();
  if (!sessionWallet) return NextResponse.json({ error: "Verify your wallet first" }, { status: 401 });
  const user = await findUser(decodeURIComponent(id));
  if (!user || user.wallet !== sessionWallet) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const set: Partial<typeof users.$inferInsert> = {};
  if (body.thesis !== undefined) {
    const t = (body.thesis || "").trim();
    if (t.length > 1000) return NextResponse.json({ error: "Thesis too long (max 1000 chars)" }, { status: 400 });
    set.thesis = t || null;
  }
  if (body.country !== undefined) {
    const c = body.country ? body.country.toUpperCase() : null;
    if (c && !isCountryCode(c)) return NextResponse.json({ error: "Invalid country" }, { status: 400 });
    set.country = c;
  }
  if (body.unlinkX) {
    set.xId = null;
    set.xHandle = null;
    set.xName = null;
    set.xAvatarUrl = null;
  }
  if (!Object.keys(set).length) return NextResponse.json({ user: toPublicUser(user, true) });

  const rows = await getDb()
    .update(users)
    .set({ ...set, updatedAt: sql`now()` })
    .where(eq(users.id, user.id))
    .returning();
  return NextResponse.json({ user: toPublicUser(rows[0], true) });
}
