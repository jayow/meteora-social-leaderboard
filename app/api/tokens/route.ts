import { NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TokenRow {
  token_mint: string;
  token_symbol: string;
  token_icon: string | null;
  pool_count: string;
  total_tvl: number | null;
  lp_count: string;
  comment_count: string;
}

export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ tokens: [] });

  const pool = getPool();

  // Aggregate tokens from open_positions (base token = token_x)
  // Also get comment counts
  const query = `
    WITH token_stats AS (
      SELECT 
        op.token_x AS token_mint,
        op.token_x AS token_symbol,
        op.token_x_icon AS token_icon,
        COUNT(DISTINCT op.pool_address) AS pool_count,
        SUM(op.value_usd) AS total_tvl,
        COUNT(DISTINCT op.user_id) AS lp_count
      FROM open_positions op
      JOIN users u ON u.id = op.user_id
      WHERE u.joined_at IS NOT NULL
      GROUP BY op.token_x, op.token_x_icon
    ),
    comment_counts AS (
      SELECT 
        token_mint,
        COUNT(*) AS comment_count
      FROM token_comments
      WHERE deleted_at IS NULL
      GROUP BY token_mint
    )
    SELECT 
      ts.*,
      COALESCE(cc.comment_count, 0)::text AS comment_count
    FROM token_stats ts
    LEFT JOIN comment_counts cc ON cc.token_mint = ts.token_mint
    ORDER BY ts.lp_count DESC, ts.total_tvl DESC NULLS LAST
    LIMIT 100
  `;

  const { rows } = await pool.query<TokenRow>(query);

  const tokens = rows.map((r) => ({
    tokenMint: r.token_mint,
    tokenSymbol: r.token_symbol,
    tokenIcon: r.token_icon,
    poolCount: Number(r.pool_count),
    totalTvl: r.total_tvl,
    lpCount: Number(r.lp_count),
    commentCount: Number(r.comment_count),
  }));

  return NextResponse.json({ tokens });
}
