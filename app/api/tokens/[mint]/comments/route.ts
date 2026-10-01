import { NextRequest, NextResponse } from "next/server";
import { getDb, getPool, hasDb } from "@/lib/db";
import { tokenComments } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

interface CommentRow {
  id: number;
  token_mint: string;
  user_id: number;
  body: string;
  created_at: string;
  x_handle: string | null;
  x_name: string | null;
  x_avatar_url: string | null;
  anon_name: string | null;
  pool_address: string | null;
  token_y: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
): Promise<NextResponse> {
  const { mint } = await params;
  
  if (!hasDb()) return NextResponse.json({ comments: [] });

  const pool = getPool();

  // Get comments with user info and one pool where they have a position
  const query = `
    SELECT 
      tc.id,
      tc.token_mint,
      tc.user_id,
      tc.body,
      tc.created_at,
      u.x_handle,
      u.x_name,
      u.x_avatar_url,
      u.anon_name,
      (
        SELECT op.pool_address
        FROM open_positions op
        WHERE op.user_id = tc.user_id AND op.token_x_mint = tc.token_mint
        LIMIT 1
      ) AS pool_address,
      (
        SELECT op.token_y
        FROM open_positions op
        WHERE op.user_id = tc.user_id AND op.token_x_mint = tc.token_mint
        LIMIT 1
      ) AS token_y
    FROM token_comments tc
    JOIN users u ON u.id = tc.user_id
    WHERE tc.token_mint = $1 AND tc.deleted_at IS NULL
    ORDER BY tc.created_at DESC
    LIMIT 100
  `;

  const { rows } = await pool.query<CommentRow>(query, [mint]);

  const comments = rows.map((r) => ({
    id: r.id,
    tokenMint: r.token_mint,
    userId: r.user_id,
    body: r.body,
    createdAt: r.created_at,
    author: {
      id: r.user_id,
      xHandle: r.x_handle,
      xName: r.x_name,
      xAvatarUrl: r.x_avatar_url,
      anonName: r.anon_name,
    },
    poolAddress: r.pool_address,
    tokenY: r.token_y,
  }));

  return NextResponse.json({ comments });
}

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

  const db = getDb();
  const pool = getPool();

  // Check if user has an open position in any pool with this base token (by mint)
  const positionCheck = await pool.query<{ has_position: boolean }>(
    `
      SELECT EXISTS(
        SELECT 1 
        FROM open_positions op
        WHERE op.user_id = $1 AND op.token_x_mint = $2
      ) AS has_position
    `,
    [user.id, mint]
  );

  if (!positionCheck.rows[0]?.has_position) {
    return NextResponse.json(
      { error: "You must have an open position in a pool with this token to post" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const text = String(body.body || "").trim();

  if (!text) {
    return NextResponse.json({ error: "Comment body required" }, { status: 400 });
  }

  if (text.length > 500) {
    return NextResponse.json({ error: "Comment too long (max 500 characters)" }, { status: 400 });
  }

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
    })
    .returning();

  return NextResponse.json({ 
    comment: {
      id: comment.id,
      tokenMint: comment.tokenMint,
      userId: comment.userId,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author: {
        id: user.id,
        xHandle: user.xHandle,
        xName: user.xName,
        xAvatarUrl: user.xAvatarUrl,
        anonName: user.anonName,
      },
    }
  }, { status: 201 });
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

  return NextResponse.json({ success: true });
}
