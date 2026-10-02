import { NextRequest, NextResponse } from "next/server";
import { getDb, getPool, hasDb } from "@/lib/db";
import { tokenComments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSessionUser, getSessionUserId } from "@/lib/session";
import { recordThesisActivity } from "@/lib/activity";
import { checkCanPost, countTheses, listTheses } from "@/lib/theses";
import { THESIS_MAX_LENGTH, type ThesisPost } from "@/lib/thesis-types";
import { trackEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

/** ThesisPost plus the legacy fields older callers read. */
type CommentOut = ThesisPost & { tokenMint: string; userId: number; poolAddress: string | null };

function toCommentOut(p: ThesisPost): CommentOut {
  return { ...p, tokenMint: p.token.mint, userId: p.author.id, poolAddress: p.pool?.address ?? null };
}

/** Public theses on this token (all of its pools), newest first. Same rows/counts as Poolside and profiles. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
): Promise<NextResponse> {
  const { mint } = await params;

  if (!hasDb()) return NextResponse.json({ comments: [], total: 0 });

  const viewerId = await getSessionUserId();
  const [posts, total] = await Promise.all([listTheses({ mint, viewerId, limit: 100 }), countTheses({ mint })]);

  return NextResponse.json(
    { comments: posts.map(toCommentOut), total },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Post a thesis on a pool of this token. Body: { body, poolAddress }. Rule (lib/theses.ts): joined
 * member with an open position in that exact pool; the thesis is tagged with it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
): Promise<NextResponse> {
  const { mint } = await params;

  if (!hasDb()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { body?: unknown; poolAddress?: unknown };
  try {
    body = (await req.json()) as { body?: unknown; poolAddress?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const poolAddress = typeof body.poolAddress === "string" ? body.poolAddress.trim() : null;

  const check = await checkCanPost(user, mint, poolAddress);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  if (!text) {
    return NextResponse.json({ error: "Write something first" }, { status: 400 });
  }

  if (text.length > THESIS_MAX_LENGTH) {
    return NextResponse.json({ error: `Too long (max ${THESIS_MAX_LENGTH} characters)` }, { status: 400 });
  }

  const db = getDb();
  const pool = getPool();

  // Basic rate limit: max 10 comments per user per token in last 24h
  const rateLimitCheck = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*) as count
      FROM token_comments
      WHERE user_id = $1 
        AND token_mint = $2 
        AND created_at > NOW() - INTERVAL '24 hours'
        AND deleted_at IS NULL
    `,
    [user.id, mint]
  );

  if (Number(rateLimitCheck.rows[0]?.count || 0) >= 10) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 }
    );
  }

  const [comment] = await db
    .insert(tokenComments)
    .values({
      tokenMint: mint,
      userId: user.id,
      body: text,
      poolAddress: check.pool.address,
      poolName: check.pool.name,
    })
    .returning();
  await recordThesisActivity(user.id, comment.id, mint, comment.createdAt);
  trackEvent("thesis_post", user.id, { thesisId: comment.id, pool: check.pool.name, length: text.length });

  const [post] = await listTheses({ ids: [comment.id], viewerId: user.id, limit: 1 });
  if (!post) return NextResponse.json({ error: "Posted, but couldn't load it back" }, { status: 500 });
  return NextResponse.json({ comment: toCommentOut(post) }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
): Promise<NextResponse> {
  const { mint } = await params;
  
  if (!hasDb()) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const commentId = url.searchParams.get("id");

  if (!commentId) {
    return NextResponse.json({ error: "Comment ID required" }, { status: 400 });
  }

  const db = getDb();

  // Verify ownership
  const [comment] = await db
    .select()
    .from(tokenComments)
    .where(
      and(
        eq(tokenComments.id, Number(commentId)),
        eq(tokenComments.tokenMint, mint),
        eq(tokenComments.userId, user.id),
        isNull(tokenComments.deletedAt)
      )
    )
    .limit(1);

  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  // Soft delete
  await db
    .update(tokenComments)
    .set({ deletedAt: new Date() })
    .where(eq(tokenComments.id, Number(commentId)));
  trackEvent("thesis_delete", user.id, { thesisId: Number(commentId) });

  return NextResponse.json({ success: true });
}
