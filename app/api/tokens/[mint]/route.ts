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

  // Fetch ALL Meteora pools with this token as base
  const meteoraPools = await fetchMeteoraPoolsForToken(mint);

  if (meteoraPools.length === 0) {
    return NextResponse.json({ 
      token: null, 
      pools: [] 
    }, { status: 404 });
  }

  // Get member data for these pools
  const pool = getPool();
  const poolAddresses = meteoraPools.map(p => p.poolAddress);
  
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
  
  // Create member data map
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

  // Token info from first pool or derived
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
