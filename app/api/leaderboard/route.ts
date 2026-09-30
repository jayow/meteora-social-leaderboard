import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { isCountryCode } from "@/lib/countries";

export const dynamic = "force-dynamic";

type Range = "7d" | "30d" | "all";
type Sort = "pnl" | "volume" | "winrate";

const COLS: Record<Range, { pnl: string; volume: string; winrate: string; fees: string }> = {
  "7d": { pnl: "s.pnl_7d", volume: "s.volume_7d_usd", winrate: "s.win_rate_7d", fees: "s.fees_30d_usd" },
  "30d": { pnl: "s.pnl_30d", volume: "s.volume_30d_usd", winrate: "s.win_rate_30d", fees: "s.fees_30d_usd" },
  all: { pnl: "s.total_pnl_usd", volume: "s.volume_usd", winrate: "s.win_rate", fees: "s.fees_usd" },
};

interface Row {
  id: number;
  wallet: string;
  x_handle: string | null;
  x_name: string | null;
  x_avatar_url: string | null;
  x_id: string | null;
  country: string | null;
  thesis: string | null;
  date: string;
  pnl: number | null;
  volume: number | null;
  win_rate: number | null;
  fees: number | null;
  total_pnl_usd: number | null;
  portfolio_value_usd: number | null;
  positions_open: number | null;
  positions_closed: number | null;
  top_pool_address: string | null;
  top_pool_name: string | null;
  top_pool_bin_step: number | null;
  top_pool_protocol: string | null;
  top_pool_x_icon: string | null;
  top_pool_y_icon: string | null;
  updated_at: Date;
  followers_count: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ entries: [], stats: null, error: "Database not configured" });
  const sp = req.nextUrl.searchParams;
  const range = (["7d", "30d", "all"].includes(sp.get("range") || "") ? sp.get("range") : "30d") as Range;
  const sort = (["pnl", "volume", "winrate"].includes(sp.get("sort") || "") ? sp.get("sort") : "pnl") as Sort;
  const countryRaw = (sp.get("country") || "").toUpperCase();
  const country = countryRaw && isCountryCode(countryRaw) ? countryRaw : null;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 500);
  const cols = COLS[range];

  // Column names come from a fixed whitelist above; user values are bound parameters.
  const sql = `
    with latest as (
      select distinct on (user_id) * from pnl_snapshots order by user_id, date desc
    )
    select u.id, u.wallet, u.x_handle, u.x_name, u.x_avatar_url, u.x_id, u.country, u.thesis,
           s.date::text as date, ${cols.pnl} as pnl, ${cols.volume} as volume, ${cols.winrate} as win_rate,
           ${cols.fees} as fees, s.total_pnl_usd, s.portfolio_value_usd, s.positions_open, s.positions_closed,
           s.top_pool_address, s.top_pool_name, s.top_pool_bin_step, s.top_pool_protocol,
           s.top_pool_x_icon, s.top_pool_y_icon, s.updated_at,
           (select count(*) from follows where followee_user_id = u.id) as followers_count
    from latest s join users u on u.id = s.user_id
    where ($1::text is null or u.country = $1)
    order by ${cols[sort]} desc nulls last, ${cols.pnl} desc nulls last, u.id asc
    limit $2`;

  const pool = getPool();
  const [{ rows }, statsRes] = await Promise.all([
    pool.query<Row>(sql, [country, limit]),
    pool.query<{ n: string; pnl: number | null; fees: number | null }>(
      `with latest as (select distinct on (user_id) * from pnl_snapshots order by user_id, date desc)
       select count(*)::text as n, sum(${cols.pnl}) as pnl, sum(${cols.fees}) as fees
       from latest s join users u on u.id = s.user_id where ($1::text is null or u.country = $1)`,
      [country]
    ),
  ]);

  const entries = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    wallet: r.wallet,
    xHandle: r.x_handle,
    xName: r.x_name,
    xAvatarUrl: r.x_avatar_url,
    xVerified: Boolean(r.x_id && r.x_handle),
    country: r.country,
    thesis: r.thesis,
    pnl: r.pnl,
    volume: r.volume,
    winRate: r.win_rate,
    fees: r.fees,
    totalPnl: r.total_pnl_usd,
    portfolioValue: r.portfolio_value_usd,
    positionsOpen: r.positions_open,
    positionsClosed: r.positions_closed,
    followersCount: Number(r.followers_count || 0),
    topPool:
      r.top_pool_address && r.top_pool_name
        ? {
            address: r.top_pool_address,
            name: r.top_pool_name,
            binStep: r.top_pool_bin_step,
            protocol: r.top_pool_protocol,
            xIcon: r.top_pool_x_icon,
            yIcon: r.top_pool_y_icon,
          }
        : null,
    snapshotDate: r.date,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));

  const st = statsRes.rows[0];
  return NextResponse.json({
    range,
    sort,
    country,
    entries,
    stats: { lps: Number(st?.n || 0), totalPnl: st?.pnl ?? 0, fees: st?.fees ?? 0 },
  });
}
