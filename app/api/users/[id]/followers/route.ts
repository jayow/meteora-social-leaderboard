import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { follows, users } from "@/lib/db/schema";
import { findUser, toPublicUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  const db = getDb();
  const results = await db
    .select({
      user: users,
      followedAt: follows.createdAt,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followerUserId, users.id))
    .where(eq(follows.followeeUserId, user.id))
    .orderBy(desc(follows.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    followers: results.map((r) => ({
      ...toPublicUser(r.user),
      followedAt: r.followedAt.toISOString(),
    })),
    hasMore: results.length === limit,
  });
}
