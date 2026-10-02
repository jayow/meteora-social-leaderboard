import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { setThesisLike } from "@/lib/theses";
import type { ThesisLikeResponse } from "@/lib/thesis-types";
import { trackEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** POST = like, DELETE = unlike. Joined members only; own theses can't be liked. Idempotent. */
async function handle(req: NextRequest, ctx: { params: Promise<{ id: string }> }, like: boolean): Promise<NextResponse<ThesisLikeResponse | { error: string }>> {
  if (!hasDb()) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  const { id } = await ctx.params;
  const commentId = Number(id);
  if (!Number.isInteger(commentId) || commentId <= 0) return NextResponse.json({ error: "Invalid LP idea id" }, { status: 400 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const result = await setThesisLike(user, commentId, like);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  trackEvent(like ? "lp_idea_like" : "lp_idea_unlike", user.id, { lpIdeaId: commentId });
  return NextResponse.json({ liked: result.liked, likeCount: result.likeCount }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, ctx, true);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(req, ctx, false);
}
