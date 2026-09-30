import { NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TokenRow {
  token_mint: string;
  token_symbol: string | null;
  token_icon: string | null;
  pool_count: string;
  member_liquidity: number | null;
  lp_count: string;
  comment_count: string;
}

export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ tokens: [] });

  const pool = getPool();

  // Aggregate tokens from open_positions (base token = token_x_mint)
  // Also get comment counts and tokens with comments
  const query = `
    WITH token_stats AS (
      SELECT 
        op.token_x_mint AS token_mint,
        op.token_x AS token_symbol,
        op.token_x_icon AS token_icon,
        COUNT(DISTINCT op.pool_address) AS pool_count,
        SUM(op.value_usd) AS member_liquidity,
        COUNT(DISTINCT op.user_id) AS lp_count
      FROM open_positions op
      JOIN users u ON u.id = op.user_id
      WHERE u.joined_at IS NOT NULL AND op.token_x_mint IS NOT NULL
      GROUP BY op.token_x_mint, op.token_x, op.token_x_icon
    ),
    comment_counts AS (
      SELECT 
        token_mint,
        COUNT(*) AS comment_count
      FROM token_comments
      WHERE deleted_at IS NULL
      GROUP BY token_mint
    ),
    tokens_with_comments AS (
      SELECT DISTINCT tc.token_mint
      FROM token_comments tc
      LEFT JOIN token_stats ts ON ts.token_mint = tc.token_mint
      WHERE tc.deleted_at IS NULL AND ts.token_mint IS NULL
    )
    SELECT 
      ts.token_mint,
      ts.token_symbol,
      ts.token_icon,
      ts.pool_count,
      ts.member_liquidity,
      ts.lp_count,
      COALESCE(cc.comment_count, 0)::text AS comment_count
    FROM token_stats ts
    LEFT JOIN comment_counts cc ON cc.token_mint = ts.token_mint
    UNION
    SELECT 
      twc.token_mint,
      NULL as token_symbol,
      NULL as token_icon,
      0 as pool_count,
      0 as member_liquidity,
      0 as lp_count,
      cc.comment_count::text
    FROM tokens_with_comments twc
    JOIN comment_counts cc ON cc.token_mint = twc.token_mint
    ORDER BY lp_count DESC, member_liquidity DESC NULLS LAST
    LIMIT 100
  `;

  const { rows } = await pool.query<TokenRow>(query);

  const tokens = rows.map((r) => ({
    tokenMint: r.token_mint,
    tokenSymbol: r.token_symbol || r.token_mint.slice(0, 4),
    tokenIcon: r.token_icon,
    poolCount: Number(r.pool_count),
    memberLiquidity: r.member_liquidity,
    lpCount: Number(r.lp_count),
    commentCount: Number(r.comment_count),
  }));

  return NextResponse.json({ tokens });
}
