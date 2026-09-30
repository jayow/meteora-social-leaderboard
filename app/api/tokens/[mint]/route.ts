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

  // First, try to fetch ALL pools from Meteora API
  let meteoraPools: Awaited<ReturnType<typeof fetchMeteoraPoolsForToken>> = [];
  try {
    meteoraPools = await fetchMeteoraPoolsForToken(mint);
  } catch (error) {
    console.error("Error fetching from Meteora API:", error);
  }

  // Get member data for pools
  const poolAddresses = meteoraPools.map(p => p.poolAddress);
  
  if (poolAddresses.length > 0) {
    const memberQuery = `
      SELECT 
        op.pool_address,
        COUNT(DISTINCT op.user_id)::text AS lp_count,
        SUM(op.value_usd) AS member_liquidity
      FROM open_positions op
      JOIN users u ON u.id = op.user_id
      WHERE op.pool_address = ANY($1) AND u.joined_at IS NOT NULL
      GROUP BY op.pool_address
    `;

    const { rows: memberRows } = await pool.query<MemberDataRow>(memberQuery, [poolAddresses]);
    
    const memberDataMap = new Map<string, { lpCount: number; memberLiquidity: number }>();
    for (const row of memberRows) {
      memberDataMap.set(row.pool_address, {
        lpCount: Number(row.lp_count),
        memberLiquidity: row.member_liquidity || 0,
      });
    }

    // Enrich pools with member data
    const enrichedPools = meteoraPools.map((p) => {
      const memberData = memberDataMap.get(p.poolAddress);
      return {
        ...p,
        memberCount: memberData?.lpCount || 0,
        memberLiquidity: memberData?.memberLiquidity || 0,
      };
    });

    // Sort by member count, then TVL
    enrichedPools.sort((a, b) => {
      if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
      return (b.tvl || 0) - (a.tvl || 0);
    });

    const firstPool = enrichedPools[0];
    const token = {
      mint,
      symbol: firstPool.tokenX,
      icon: firstPool.tokenXIcon,
      poolCount: enrichedPools.length,
      totalTvl: enrichedPools.reduce((sum, p) => sum + (p.tvl || 0), 0),
      memberLiquidity: enrichedPools.reduce((sum, p) => sum + (p.memberLiquidity || 0), 0),
      lpCount: enrichedPools.reduce((sum, p) => sum + p.memberCount, 0),
    };

    return NextResponse.json({ token, pools: enrichedPools });
  }

  // Fallback: Use member-held pools from DB if Meteora API failed
  const memberPoolsQuery = `
    SELECT 
      op.pool_address,
      MAX(op.token_x) AS token_symbol,
      op.token_y,
      MAX(op.token_x_icon) AS token_x_icon,
      MAX(op.token_y_icon) AS token_y_icon,
      MAX(op.bin_step) AS bin_step,
      MAX(op.protocol) AS protocol,
      COUNT(DISTINCT op.user_id)::text AS lp_count,
      SUM(op.value_usd) AS member_liquidity
    FROM open_positions op
    JOIN users u ON u.id = op.user_id
    WHERE op.token_x_mint = $1 AND u.joined_at IS NOT NULL
    GROUP BY op.pool_address, op.token_y
  `;

  const { rows: memberPoolRows } = await pool.query<{
    pool_address: string;
    token_symbol: string;
    token_y: string;
    token_x_icon: string | null;
    token_y_icon: string | null;
    bin_step: number | null;
    protocol: string | null;
    lp_count: string;
    member_liquidity: number | null;
  }>(memberPoolsQuery, [mint]);

  if (memberPoolRows.length > 0) {
    const pools = memberPoolRows.map((r) => ({
      poolAddress: r.pool_address,
      tokenX: r.token_symbol,
      tokenY: r.token_y,
      tokenXMint: mint,
      tokenYMint: "",
      tokenXIcon: r.token_x_icon,
      tokenYIcon: r.token_y_icon,
      binStep: r.bin_step,
      protocol: r.protocol || "dlmm",
      tvl: r.member_liquidity,
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

  return NextResponse.json({ 
    token: null, 
    pools: [] 
  }, { status: 404 });
}
