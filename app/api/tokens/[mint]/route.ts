import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { jsonMaybeGzip } from "@/lib/json-gzip";
import { fetchMeteoraPoolsForToken } from "@/lib/meteora-pools";
import { comparePoolRows, isPoolSort, matchesPoolQuery, type PoolListRow, type TokenPoolsResponse, type TokenSummary } from "@/lib/pool-list";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

interface MemberStatsRow {
  pool_address: string;
  lp_count: string;
  member_liquidity: number | null;
}

interface MemberPoolRow extends MemberStatsRow {
  token_x: string;
  token_y: string;
  token_x_mint: string | null;
  token_y_mint: string | null;
  token_x_icon: string | null;
  token_y_icon: string | null;
  bin_step: number | null;
  protocol: string | null;
}

function intParam(v: string | null, def: number, min: number, max: number): number {
  const n = v == null ? NaN : Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
}

/**
 * GET /api/tokens/:mint?offset=0&limit=50&sort=members|tvl|volume|liquidity&q=usdc
 * All DLMM pools with :mint as base token, sorted and filtered server-side over the full set,
 * returned a page at a time with only the fields a pool row renders.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }): Promise<NextResponse> {
  const { mint } = await params;
  const sp = req.nextUrl.searchParams;
  const offset = intParam(sp.get("offset"), 0, 0, 1_000_000);
  const limit = intParam(sp.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const sortParam = sp.get("sort");
  const sort = isPoolSort(sortParam) ? sortParam : "members";
  const q = (sp.get("q") || "").slice(0, 64);

  const empty: TokenPoolsResponse = { token: null, pools: [], total: 0, offset, limit, hasMore: false, source: "members" };
  if (!hasDb()) return NextResponse.json(empty);

  const db = getPool();
  const meteoraPools = await fetchMeteoraPoolsForToken(mint);

  let rows: PoolListRow[];
  let source: TokenPoolsResponse["source"];

  if (meteoraPools.length > 0) {
    source = "meteora";
    const { rows: memberRows } = await db.query<MemberStatsRow>(
      `SELECT op.pool_address, COUNT(DISTINCT op.user_id)::text AS lp_count, SUM(op.value_usd) AS member_liquidity
       FROM open_positions op
       JOIN users u ON u.id = op.user_id
       WHERE op.pool_address = ANY($1) AND u.joined_at IS NOT NULL
       GROUP BY op.pool_address`,
      [meteoraPools.map((p) => p.poolAddress)]
    );
    const members = new Map(memberRows.map((r) => [r.pool_address, r]));
    rows = meteoraPools.map((p) => {
      const m = members.get(p.poolAddress);
      return {
        poolAddress: p.poolAddress,
        tokenX: p.tokenX,
        tokenY: p.tokenY,
        tokenXMint: p.tokenXMint || null,
        tokenYMint: p.tokenYMint || null,
        tokenXIcon: p.tokenXIcon,
        tokenYIcon: p.tokenYIcon,
        binStep: p.binStep,
        protocol: p.protocol,
        lpCount: m ? Number(m.lp_count) : 0,
        memberLiquidity: m ? m.member_liquidity : null,
        tvl: p.tvl,
        volume24h: p.volume24h,
      };
    });
  } else {
    // Fallback: Meteora unavailable, use member-held pools from the DB
    source = "members";
    const { rows: memberPools } = await db.query<MemberPoolRow>(
      `SELECT op.pool_address,
              MAX(op.token_x) AS token_x, MAX(op.token_y) AS token_y,
              MAX(op.token_x_mint) AS token_x_mint, MAX(op.token_y_mint) AS token_y_mint,
              MAX(op.token_x_icon) AS token_x_icon, MAX(op.token_y_icon) AS token_y_icon,
              MAX(op.bin_step) AS bin_step, MAX(op.protocol) AS protocol,
              COUNT(DISTINCT op.user_id)::text AS lp_count, SUM(op.value_usd) AS member_liquidity
       FROM open_positions op
       JOIN users u ON u.id = op.user_id
       WHERE op.token_x_mint = $1 AND u.joined_at IS NOT NULL
       GROUP BY op.pool_address`,
      [mint]
    );
    rows = memberPools.map((r) => ({
      poolAddress: r.pool_address,
      tokenX: r.token_x,
      tokenY: r.token_y,
      tokenXMint: r.token_x_mint,
      tokenYMint: r.token_y_mint,
      tokenXIcon: r.token_x_icon,
      tokenYIcon: r.token_y_icon,
      binStep: r.bin_step,
      protocol: r.protocol || "dlmm",
      lpCount: Number(r.lp_count),
      memberLiquidity: r.member_liquidity,
      tvl: null,
      volume24h: null,
    }));
  }

  if (rows.length === 0) return NextResponse.json(empty, { status: 404 });

  const first = rows[0];
  const token: TokenSummary = {
    mint,
    symbol: first.tokenX,
    icon: rows.find((r) => r.tokenXIcon)?.tokenXIcon ?? null,
    poolCount: rows.length,
    totalTvl: rows.reduce((sum, r) => sum + (r.tvl ?? 0), 0),
    memberLiquidity: rows.reduce((sum, r) => sum + (r.memberLiquidity ?? 0), 0),
    lpCount: rows.reduce((sum, r) => sum + r.lpCount, 0),
  };

  const filtered = q ? rows.filter((r) => matchesPoolQuery(r, q)) : rows;
  filtered.sort(comparePoolRows(sort));
  const page = filtered.slice(offset, offset + limit);

  const body: TokenPoolsResponse = {
    token,
    pools: page,
    total: filtered.length,
    offset,
    limit,
    hasMore: offset + page.length < filtered.length,
    source,
  };
  return jsonMaybeGzip(req, body, { headers: { "Cache-Control": "private, max-age=15" } });
}
