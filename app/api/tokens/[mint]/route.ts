import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { fetchMeteoraPoolsForToken } from "@/lib/meteora-pools";

export const dynamic = "force-dynamic";

interface MemberDataRow {
  pool_address: string;
  lp_count: string;
  member_liquidity: number | null;
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

  // First, check if we have member-held pools for this token (by mint or symbol as fallback)
  const memberPoolsQuery = `
    SELECT 
      op.pool_address,
      op.token_x AS token_symbol,
      op.token_y,
      op.token_x_icon,
      op.token_y_icon,
      op.bin_step,
      op.protocol,
      op.value_usd,
      COUNT(DISTINCT op.user_id)::text AS lp_count,
      SUM(op.value_usd) AS member_liquidity
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    WHERE (op.token_x_mint = $1 OR (op.token_x_mint IS NULL AND op.token_x = $1))
      AND u.joined_at IS NOT NULL
    GROUP BY op.pool_address, op.token_x, op.token_y, op.token_x_icon, op.token_y_icon, op.bin_step, op.protocol, op.value_usd
  `;

  const { rows: memberPoolRows } = await pool.query<{
    pool_address: string;
    token_symbol: string;
    token_y: string;
    token_x_icon: string | null;
    token_y_icon: string | null;
    bin_step: number | null;
    protocol: string | null;
    value_usd: number | null;
    lp_count: string;
    member_liquidity: number | null;
  }>(memberPoolsQuery, [mint]);

  // If we have member pools, use them as the primary data source
  if (memberPoolRows.length > 0) {
    const pools = memberPoolRows.map((r) => ({
      poolAddress: r.pool_address,
      tokenX: r.token_symbol,
      tokenY: r.token_y,
      tokenXMint: mint,
      tokenYMint: "", // Unknown
      tokenXIcon: r.token_x_icon,
      tokenYIcon: r.token_y_icon,
      binStep: r.bin_step,
      protocol: r.protocol || "dlmm",
      tvl: r.value_usd, // Use member liquidity as proxy for TVL
      volume24h: null,
      fees24h: null,
      apr: null,
      memberCount: Number(r.lp_count),
      memberLiquidity: r.member_liquidity || 0,
    }));

    const token = {
      mint,
      symbol: memberPoolRows[0].token_symbol,
      icon: memberPoolRows[0].token_x_icon,
      poolCount: pools.length,
      totalTvl: pools.reduce((sum, p) => sum + (p.tvl || 0), 0),
      memberLiquidity: pools.reduce((sum, p) => sum + (p.memberLiquidity || 0), 0),
      lpCount: pools.reduce((sum, p) => sum + p.memberCount, 0),
    };

    return NextResponse.json({ token, pools });
  }

  // Fallback: Try to fetch from Meteora API (may timeout)
  try {
    const meteoraPools = await fetchMeteoraPoolsForToken(mint);
    
    if (meteoraPools.length > 0) {
      const firstPool = meteoraPools[0];
      const token = {
        mint,
        symbol: firstPool.tokenX,
        icon: firstPool.tokenXIcon,
        poolCount: meteoraPools.length,
        totalTvl: meteoraPools.reduce((sum, p) => sum + (p.tvl || 0), 0),
        memberLiquidity: 0,
        lpCount: 0,
      };

      return NextResponse.json({ token, pools: meteoraPools.map(p => ({ ...p, memberCount: 0, memberLiquidity: 0 })) });
    }
  } catch (error) {
    console.error("Error fetching from Meteora API:", error);
  }

  return NextResponse.json({ 
    token: null, 
    pools: [] 
  }, { status: 404 });
}
