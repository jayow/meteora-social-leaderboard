import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { jsonMaybeGzip } from "@/lib/json-gzip";
import { getSessionUserId } from "@/lib/session";
import { fetchMeteoraPoolStats } from "@/lib/meteora-pools";
import type { PoolListRow } from "@/lib/pool-list";

export const dynamic = "force-dynamic";

interface PoolRow {
  pool_address: string;
  token_x: string;
  token_y: string;
  token_x_mint: string | null;
  token_y_mint: string | null;
  token_x_icon: string | null;
  token_y_icon: string | null;
  bin_step: number | null;
  protocol: string | null;
  lp_count: string;
  total_value_usd: number | null;
  friends_count: string;
  friend_avatars: string[] | null;
  friend_handles: string[] | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ pools: [] });

  // Works for wallet and X sessions (session is keyed by user id).
  const currentUserId = await getSessionUserId();

  const pool = getPool();

  // Aggregate pools from open_positions (one row per pool; rows for the same pool can differ in icons etc.)
  const sql = currentUserId
    ? `
    WITH pool_stats AS (
      SELECT 
        op.pool_address,
        MAX(op.token_x) AS token_x,
        MAX(op.token_y) AS token_y,
        MAX(op.token_x_mint) AS token_x_mint,
        MAX(op.token_y_mint) AS token_y_mint,
        MAX(op.token_x_icon) AS token_x_icon,
        MAX(op.token_y_icon) AS token_y_icon,
        MAX(op.bin_step) AS bin_step,
        MAX(op.protocol) AS protocol,
        COUNT(DISTINCT op.user_id) AS lp_count,
        SUM(op.value_usd) AS total_value_usd
      FROM open_positions op
      JOIN users u ON u.id = op.user_id
      WHERE u.joined_at IS NOT NULL
      GROUP BY op.pool_address
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
      WHERE f.follower_user_id = $1 AND u.joined_at IS NOT NULL
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
      MAX(op.token_x) AS token_x,
      MAX(op.token_y) AS token_y,
      MAX(op.token_x_mint) AS token_x_mint,
      MAX(op.token_y_mint) AS token_y_mint,
      MAX(op.token_x_icon) AS token_x_icon,
      MAX(op.token_y_icon) AS token_y_icon,
      MAX(op.bin_step) AS bin_step,
      MAX(op.protocol) AS protocol,
      COUNT(DISTINCT op.user_id)::text AS lp_count,
      SUM(op.value_usd) AS total_value_usd,
      '0' AS friends_count,
      NULL AS friend_avatars,
      NULL AS friend_handles
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    WHERE u.joined_at IS NOT NULL
    GROUP BY op.pool_address
    ORDER BY COUNT(DISTINCT op.user_id) DESC, SUM(op.value_usd) DESC NULLS LAST
    LIMIT 100
  `;

  const { rows } = await pool.query<PoolRow>(sql, currentUserId ? [currentUserId] : []);

  // Pool TVL / 24h volume (and token icons the DB lacks) from Meteora: one batched, cached request.
  const stats = await fetchMeteoraPoolStats(rows.map((r) => r.pool_address));

  const pools: Array<PoolListRow & { totalValueUsd: number | null; friendsCount: number; friendAvatars: string[]; friendHandles: string[] }> = rows.map((r) => {
    const m = stats.get(r.pool_address);
    return {
      poolAddress: r.pool_address,
      tokenX: r.token_x,
      tokenY: r.token_y,
      tokenXMint: r.token_x_mint,
      tokenYMint: r.token_y_mint,
      tokenXIcon: r.token_x_icon || m?.tokenXIcon || null,
      tokenYIcon: r.token_y_icon || m?.tokenYIcon || null,
      binStep: r.bin_step,
      protocol: r.protocol,
      lpCount: Number(r.lp_count),
      memberLiquidity: r.total_value_usd,
      tvl: m?.tvl ?? null,
      volume24h: m?.volume24h ?? null,
      // Kept for compatibility: totalValueUsd is the members' liquidity, not pool TVL.
      totalValueUsd: r.total_value_usd,
      friendsCount: Number(r.friends_count),
      friendAvatars: r.friend_avatars ? (Array.isArray(r.friend_avatars) ? r.friend_avatars : []) : [],
      friendHandles: r.friend_handles ? (Array.isArray(r.friend_handles) ? r.friend_handles : []) : [],
    };
  });

  return jsonMaybeGzip(req, { pools });
}
