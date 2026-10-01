import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

interface MemberRow {
  pool_address: string;
  user_id: number;
  x_avatar_url: string | null;
  x_handle: string | null;
  anon_name: string | null;
  is_followed: boolean;
}

interface PoolMembers {
  poolAddress: string;
  members: Array<{
    userId: number;
    xAvatarUrl: string | null;
    xHandle: string | null;
    anonName: string | null;
    isFollowed: boolean;
  }>;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ pools: [] });

  const { searchParams } = new URL(req.url);
  const poolsParam = searchParams.get("pools");
  
  if (!poolsParam) {
    return NextResponse.json({ error: "pools parameter required" }, { status: 400 });
  }

  const poolAddresses = poolsParam.split(",").filter(Boolean);
  
  if (poolAddresses.length === 0) {
    return NextResponse.json({ pools: [] });
  }

  const currentUser = await getSessionUser();
  const pool = getPool();

  const sql = currentUser
    ? `
    SELECT 
      op.pool_address,
      u.id AS user_id,
      u.x_avatar_url,
      u.x_handle,
      u.anon_name,
      EXISTS(
        SELECT 1 FROM follows 
        WHERE follower_user_id = $1 AND followee_user_id = u.id
      ) AS is_followed
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    WHERE 
      op.pool_address = ANY($2::text[])
      AND u.joined_at IS NOT NULL
    ORDER BY 
      is_followed DESC,
      u.x_handle ASC NULLS LAST
  `
    : `
    SELECT 
      op.pool_address,
      u.id AS user_id,
      u.x_avatar_url,
      u.x_handle,
      u.anon_name,
      false AS is_followed
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    WHERE 
      op.pool_address = ANY($1::text[])
      AND u.joined_at IS NOT NULL
    ORDER BY 
      u.x_handle ASC NULLS LAST
  `;

  const params = currentUser ? [currentUser.id, poolAddresses] : [poolAddresses];
  const { rows } = await pool.query<MemberRow>(sql, params);

  const poolsMap = new Map<string, PoolMembers>();

  for (const row of rows) {
    if (!poolsMap.has(row.pool_address)) {
      poolsMap.set(row.pool_address, {
        poolAddress: row.pool_address,
        members: [],
      });
    }

    poolsMap.get(row.pool_address)!.members.push({
      userId: row.user_id,
      xAvatarUrl: row.x_avatar_url,
      xHandle: row.x_handle,
      anonName: row.anon_name,
      isFollowed: row.is_followed,
    });
  }

  return NextResponse.json({ pools: Array.from(poolsMap.values()) });
}
