import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { findUser, getFollowList, type FollowListKind } from "@/lib/users";

/** Viewer-specific (isFollowing, own unjoined entries): never cache. */
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

/** Shared GET handler for /api/users/[id]/followers and /api/users/[id]/following. */
export async function followListResponse(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
  kind: FollowListKind
): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  const viewerId = await getSessionUserId();
  // Same rule as profiles: joined members are public, unjoined accounts are owner-only.
  if (!user || (!user.joinedAt && viewerId !== user.id)) {
    return NextResponse.json({ error: "User not found" }, { status: 404, headers: PRIVATE_HEADERS });
  }
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 100);
  const offset = Math.max(Number(sp.get("offset")) || 0, 0);
  const items = await getFollowList(user.id, kind, viewerId, limit + 1, offset);
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const body = kind === "followers" ? { followers: page, hasMore } : { following: page, hasMore };
  return NextResponse.json(body, { headers: PRIVATE_HEADERS });
}
