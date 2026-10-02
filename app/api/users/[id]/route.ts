import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ensureAnonName, findUser, getFollowCounts, getUserWalletAddresses, isUserFollowing, latestSnapshot, toPublicSnapshot, toPublicUser } from "@/lib/users";
import { getSessionUserId } from "@/lib/session";
import { isCountryCode } from "@/lib/countries";
import { listBadges } from "@/lib/badges/compute";

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
  const counts = await getFollowCounts(user.id, currentUserId);
  // Primary users.wallet (wallet signups, minus X temp_ placeholders) + linked wallets.
  const walletCount = (await getUserWalletAddresses(user)).length;

  const isFollowing = await isUserFollowing(currentUserId, user.id);
  // Members only (listBadges skips unjoined users), so an owner who hasn't joined gets [].
  const badges = (await listBadges([user.id])).get(user.id) ?? [];
  
  const publicUser = {
    ...toPublicUser(user, isOwnProfile),
    followersCount: counts.followersCount,
    followingCount: counts.followingCount,
    isFollowing,
    walletCount,
  };
  
  // Owner responses include private fields (wallet, own counts): never cache.
  return NextResponse.json(
    { user: publicUser, snapshot: snap ? toPublicSnapshot(snap) : null, badges },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

interface PatchBody {
  thesis?: string | null;
  country?: string | null;
  unlinkX?: boolean;
}

/** Update your own profile. Requires a session (wallet-signed or X) for this user. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const user = await findUser(decodeURIComponent(id));
  if (!user || user.id !== sessionUserId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const set: Partial<typeof users.$inferInsert> = {};
  if (body.thesis !== undefined) {
    const t = (body.thesis || "").trim();
    if (t.length > 1000) return NextResponse.json({ error: "LP idea too long (max 1000 chars)" }, { status: 400 });
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
  const updated = body.unlinkX && rows[0] ? await ensureAnonName(rows[0]) : rows[0];
  return NextResponse.json({ user: toPublicUser(updated, true) });
}
