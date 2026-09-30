import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, getPool, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionWallet } from "@/lib/session";

export const dynamic = "force-dynamic";

interface PoolRow {
  pool_address: string;
  token_x: string;
  token_y: string;
  token_x_icon: string | null;
  token_y_icon: string | null;
  bin_step: number | null;
  protocol: string | null;
  lp_count: string;
  total_value_usd: number | null;
  friends_count: string;
  friend_avatars: string | null;
  friend_handles: string | null;
}

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ pools: [] });

  const sessionWallet = await getSessionWallet();
  let currentUserId: number | null = null;

  if (sessionWallet) {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.wallet, sessionWallet)).limit(1);
    if (user) currentUserId = user.id;
  }

  const pool = getPool();

  // Aggregate pools from open_positions
  const sql = currentUserId
    ? `
    WITH pool_stats AS (
      SELECT 
        op.pool_address,
        op.token_x,
        op.token_y,
        op.token_x_icon,
        op.token_y_icon,
        op.bin_step,
        op.protocol,
        COUNT(DISTINCT op.user_id) AS lp_count,
        SUM(op.value_usd) AS total_value_usd
      FROM open_positions op
      GROUP BY op.pool_address, op.token_x, op.token_y, op.token_x_icon, op.token_y_icon, op.bin_step, op.protocol
    ),
    friends_in_pool AS (
      SELECT 
        op.pool_address,
        COUNT(DISTINCT op.user_id) AS friends_count,
        ARRAY_AGG(DISTINCT u.x_avatar_url ORDER BY u.x_avatar_url) FILTER (WHERE u.x_avatar_url IS NOT NULL) AS friend_avatars,
        ARRAY_AGG(DISTINCT u.x_handle ORDER BY u.x_handle) FILTER (WHERE u.x_handle IS NOT NULL) AS friend_handles
      FROM open_positions op
      JOIN follows f ON f.followee_user_id = op.user_id
      JOIN users u ON u.id = op.user_id
      WHERE f.follower_user_id = $1
      GROUP BY op.pool_address
    )
    SELECT 
      ps.*,
      COALESCE(fip.friends_count, 0) AS friends_count,
      fip.friend_avatars,
      fip.friend_handles
    FROM pool_stats ps
    LEFT JOIN friends_in_pool fip ON fip.pool_address = ps.pool_address
    ORDER BY COALESCE(fip.friends_count, 0) DESC, ps.lp_count DESC, ps.total_value_usd DESC NULLS LAST
    LIMIT 100
  `
    : `
    SELECT 
      op.pool_address,
      op.token_x,
      op.token_y,
      op.token_x_icon,
      op.token_y_icon,
      op.bin_step,
      op.protocol,
      COUNT(DISTINCT op.user_id)::text AS lp_count,
      SUM(op.value_usd) AS total_value_usd,
      '0' AS friends_count,
      NULL AS friend_avatars,
      NULL AS friend_handles
    FROM open_positions op
    GROUP BY op.pool_address, op.token_x, op.token_y, op.token_x_icon, op.token_y_icon, op.bin_step, op.protocol
    ORDER BY COUNT(DISTINCT op.user_id) DESC, SUM(op.value_usd) DESC NULLS LAST
    LIMIT 100
  `;

  const { rows } = await pool.query<PoolRow>(sql, currentUserId ? [currentUserId] : []);

  const pools = rows.map((r) => ({
    poolAddress: r.pool_address,
    tokenX: r.token_x,
    tokenY: r.token_y,
    tokenXIcon: r.token_x_icon,
    tokenYIcon: r.token_y_icon,
    binStep: r.bin_step,
    protocol: r.protocol,
    lpCount: Number(r.lp_count),
    totalValueUsd: r.total_value_usd,
    friendsCount: Number(r.friends_count),
    friendAvatars: r.friend_avatars ? (Array.isArray(r.friend_avatars) ? r.friend_avatars : []) : [],
    friendHandles: r.friend_handles ? (Array.isArray(r.friend_handles) ? r.friend_handles : []) : [],
  }));

  return NextResponse.json({ pools });
}
