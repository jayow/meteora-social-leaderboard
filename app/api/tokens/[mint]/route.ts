import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

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
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
): Promise<NextResponse> {
  const { mint } = await params;
  
  if (!hasDb()) {
    return NextResponse.json({ 
      token: null, 
      pools: [] 
    });
  }

  const pool = getPool();

  // Get all pools where this token is the base token (token_x)
  const query = `
    SELECT 
      op.pool_address,
      op.token_x,
      op.token_y,
      op.token_x_icon,
      op.token_y_icon,
      op.bin_step,
      op.protocol,
      COUNT(DISTINCT op.user_id)::text AS lp_count,
      SUM(op.value_usd) AS total_value_usd
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    WHERE op.token_x = $1 AND u.joined_at IS NOT NULL
    GROUP BY op.pool_address, op.token_x, op.token_y, op.token_x_icon, op.token_y_icon, op.bin_step, op.protocol
    ORDER BY COUNT(DISTINCT op.user_id) DESC, SUM(op.value_usd) DESC NULLS LAST
  `;

  const { rows } = await pool.query<PoolRow>(query, [mint]);

  if (rows.length === 0) {
    return NextResponse.json({ 
      token: null, 
      pools: [] 
    }, { status: 404 });
  }

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
  }));

  // Token info from first pool
  const token = {
    mint,
    symbol: rows[0].token_x,
    icon: rows[0].token_x_icon,
    poolCount: pools.length,
    totalTvl: pools.reduce((sum, p) => sum + (p.totalValueUsd || 0), 0),
    lpCount: pools.reduce((sum, p) => sum + p.lpCount, 0),
  };

  return NextResponse.json({ token, pools });
}
