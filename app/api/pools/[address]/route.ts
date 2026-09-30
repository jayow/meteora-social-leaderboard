import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, getPool, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionWallet } from "@/lib/session";

export const dynamic = "force-dynamic";

interface LPRow {
  user_id: number;
  wallet: string;
  x_handle: string | null;
  x_name: string | null;
  x_avatar_url: string | null;
  x_id: string | null;
  country: string | null;
  value_usd: number | null;
  total_pnl_usd: number | null;
  is_following: boolean;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
): Promise<NextResponse> {
  const { address } = await params;
  
  if (!hasDb()) return NextResponse.json({ pool: null, lps: [] });

  const sessionWallet = await getSessionWallet();
  let currentUserId: number | null = null;

  if (sessionWallet) {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.wallet, sessionWallet)).limit(1);
    if (user) currentUserId = user.id;
  }

  const pool = getPool();

  // Get pool info
  const poolSql = `
    SELECT 
      pool_address,
      token_x,
      token_y,
      token_x_icon,
      token_y_icon,
      bin_step,
      protocol,
      COUNT(DISTINCT user_id)::text AS lp_count,
      SUM(value_usd) AS total_value_usd
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    WHERE op.pool_address = $1 AND u.joined_at IS NOT NULL
    GROUP BY pool_address, token_x, token_y, token_x_icon, token_y_icon, bin_step, protocol
  `;

  const poolRes = await pool.query(poolSql, [address]);
  if (poolRes.rows.length === 0) {
    return NextResponse.json({ pool: null, lps: [] });
  }

  const poolRow = poolRes.rows[0] as {
    pool_address: string;
    token_x: string;
    token_y: string;
    token_x_icon: string | null;
    token_y_icon: string | null;
    bin_step: number | null;
    protocol: string | null;
    lp_count: string;
    total_value_usd: number | null;
  };

  const poolData = {
    poolAddress: poolRow.pool_address,
    tokenX: poolRow.token_x,
    tokenY: poolRow.token_y,
    tokenXIcon: poolRow.token_x_icon,
    tokenYIcon: poolRow.token_y_icon,
    binStep: poolRow.bin_step,
    protocol: poolRow.protocol,
    lpCount: Number(poolRow.lp_count),
    totalValueUsd: poolRow.total_value_usd,
  };

  // Get LPs in this pool
  const lpsSql = currentUserId
    ? `
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (user_id) user_id, total_pnl_usd
      FROM pnl_snapshots
      ORDER BY user_id, date DESC
    )
    SELECT 
      u.id AS user_id,
      u.wallet,
      u.x_handle,
      u.x_name,
      u.x_avatar_url,
      u.x_id,
      u.country,
      op.value_usd,
      ls.total_pnl_usd,
      EXISTS(SELECT 1 FROM follows WHERE follower_user_id = $2 AND followee_user_id = u.id) AS is_following
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    LEFT JOIN latest_snapshots ls ON ls.user_id = u.id
    WHERE op.pool_address = $1 AND u.joined_at IS NOT NULL
    ORDER BY 
      EXISTS(SELECT 1 FROM follows WHERE follower_user_id = $2 AND followee_user_id = u.id) DESC,
      op.value_usd DESC NULLS LAST
  `
    : `
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (user_id) user_id, total_pnl_usd
      FROM pnl_snapshots
      ORDER BY user_id, date DESC
    )
    SELECT 
      u.id AS user_id,
      u.wallet,
      u.x_handle,
      u.x_name,
      u.x_avatar_url,
      u.x_id,
      u.country,
      op.value_usd,
      ls.total_pnl_usd,
      false AS is_following
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    LEFT JOIN latest_snapshots ls ON ls.user_id = u.id
    WHERE op.pool_address = $1 AND u.joined_at IS NOT NULL
    ORDER BY op.value_usd DESC NULLS LAST
  `;

  const lpsRes = await pool.query<LPRow>(lpsSql, currentUserId ? [address, currentUserId] : [address]);

  const lps = lpsRes.rows.map((r) => ({
    id: r.user_id,
    xHandle: r.x_handle,
    xName: r.x_name,
    xAvatarUrl: r.x_avatar_url,
    xVerified: Boolean(r.x_id && r.x_handle),
    country: r.country,
    valueUsd: r.value_usd,
    totalPnl: r.total_pnl_usd,
    isFollowing: r.is_following,
  }));

  return NextResponse.json({ pool: poolData, lps });
}
