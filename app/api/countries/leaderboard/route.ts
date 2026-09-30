import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { countryName } from "@/lib/countries";

export const dynamic = "force-dynamic";

type Range = "7d" | "30d" | "all";

const COLS: Record<Range, { pnl: string; fees: string; volume: string }> = {
  "7d": { pnl: "pnl_7d", fees: "fees_7d_usd", volume: "volume_7d_usd" },
  "30d": { pnl: "pnl_30d", fees: "fees_30d_usd", volume: "volume_30d_usd" },
  all: { pnl: "total_pnl_usd", fees: "fees_usd", volume: "volume_usd" },
};

interface CountryStatsRow {
  country: string;
  members: string;
  total_pnl: number | null;
  total_fees: number | null;
  total_volume: number | null;
  avg_win_rate: number | null;
  top_lp_id: number | null;
  top_lp_x_handle: string | null;
  top_lp_x_name: string | null;
  top_lp_x_avatar_url: string | null;
  top_lp_pnl: number | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ entries: [], error: "Database not configured" });
  
  const sp = req.nextUrl.searchParams;
  const range = (["7d", "30d", "all"].includes(sp.get("range") || "") ? sp.get("range") : "30d") as Range;
  const cols = COLS[range];
  
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (user_id) * 
      FROM pnl_snapshots 
      ORDER BY user_id, date DESC
    ),
    country_stats AS (
      SELECT 
        u.country,
        COUNT(*)::text AS members,
        SUM(s.${cols.pnl}) AS total_pnl,
        SUM(s.${cols.fees}) AS total_fees,
        SUM(s.${cols.volume}) AS total_volume,
        AVG(
          CASE 
            WHEN ${range === "7d" ? "s.win_rate_7d" : range === "30d" ? "s.win_rate_30d" : "s.win_rate"} IS NOT NULL 
            THEN ${range === "7d" ? "s.win_rate_7d" : range === "30d" ? "s.win_rate_30d" : "s.win_rate"}
          END
        ) AS avg_win_rate
      FROM users u
      JOIN latest s ON s.user_id = u.id
      WHERE u.country IS NOT NULL AND u.joined_at IS NOT NULL
      GROUP BY u.country
    ),
    top_lps AS (
      SELECT DISTINCT ON (u.country)
        u.country,
        u.id AS top_lp_id,
        u.x_handle AS top_lp_x_handle,
        u.x_name AS top_lp_x_name,
        u.x_avatar_url AS top_lp_x_avatar_url,
        s.${cols.pnl} AS top_lp_pnl
      FROM users u
      JOIN latest s ON s.user_id = u.id
      WHERE u.country IS NOT NULL AND u.joined_at IS NOT NULL
      ORDER BY u.country, s.${cols.pnl} DESC NULLS LAST
    )
    SELECT 
      cs.country,
      cs.members,
      cs.total_pnl,
      cs.total_fees,
      cs.total_volume,
      cs.avg_win_rate,
      tl.top_lp_id,
      tl.top_lp_x_handle,
      tl.top_lp_x_name,
      tl.top_lp_x_avatar_url,
      tl.top_lp_pnl
    FROM country_stats cs
    LEFT JOIN top_lps tl ON tl.country = cs.country
    ORDER BY cs.total_pnl DESC NULLS LAST, cs.country ASC
  `;

  const pool = getPool();
  const { rows } = await pool.query<CountryStatsRow>(sql);

  const entries = rows.map((r, i) => ({
    rank: i + 1,
    country: r.country,
    name: countryName(r.country),
    members: Number(r.members),
    totalPnl: r.total_pnl,
    totalFees: r.total_fees,
    totalVolume: r.total_volume,
    avgWinRate: r.avg_win_rate,
    topLp: r.top_lp_id ? {
      id: r.top_lp_id,
      xHandle: r.top_lp_x_handle,
      xName: r.top_lp_x_name,
      xAvatarUrl: r.top_lp_x_avatar_url,
      pnl: r.top_lp_pnl,
    } : null,
  }));

  return NextResponse.json({ range, entries });
}
