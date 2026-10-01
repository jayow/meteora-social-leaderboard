import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { follows, users } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import { getFollowCounts } from "@/lib/users";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

interface FollowBody {
  targetId: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const currentUser = await getSessionUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let body: FollowBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.targetId || typeof body.targetId !== "number") {
    return NextResponse.json({ error: "targetId required" }, { status: 400 });
  }

  const db = getDb();
  
  if (currentUser.id === body.targetId) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  const [targetUser] = await db.select().from(users).where(eq(users.id, body.targetId)).limit(1);
  // Not-yet-joined accounts are private (owner-only), so they can't be followed. The follower only
  // needs a valid session (wallet or X); unjoined followers are allowed.
  if (!targetUser || !targetUser.joinedAt) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  try {
    await db.insert(follows).values({
      followerUserId: currentUser.id,
      followeeUserId: body.targetId,
    }).onConflictDoNothing();
    await recordActivity({ actorUserId: currentUser.id, kind: "followed", targetUserId: body.targetId, dedupeKey: `followed:${currentUser.id}:${body.targetId}` });

    const [{ followersCount }, { followingCount }] = await Promise.all([
      getFollowCounts(body.targetId, currentUser.id),
      getFollowCounts(currentUser.id, currentUser.id),
    ]);
    return NextResponse.json(
      { success: true, following: true, followersCount, viewerFollowingCount: followingCount },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("Error creating follow:", error);
    return NextResponse.json({ error: "Failed to follow user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const currentUser = await getSessionUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let body: FollowBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.targetId || typeof body.targetId !== "number") {
    return NextResponse.json({ error: "targetId required" }, { status: 400 });
  }

  const db = getDb();
  
  await db.delete(follows).where(
    and(
      eq(follows.followerUserId, currentUser.id),
      eq(follows.followeeUserId, body.targetId)
    )
  );

  const [{ followersCount }, { followingCount }] = await Promise.all([
    getFollowCounts(body.targetId, currentUser.id),
    getFollowCounts(currentUser.id, currentUser.id),
  ]);
  return NextResponse.json(
    { success: true, following: false, followersCount, viewerFollowingCount: followingCount },
    { headers: NO_STORE }
  );
}
