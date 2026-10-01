import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { isCountryCode } from "@/lib/countries";
import { getSessionUserId } from "@/lib/session";
import { HAS_DATA_SQL, LEADERBOARD_COLS, boardOrderSql, type LeaderboardRange as Range, type LeaderboardSort as Sort } from "@/lib/leaderboard-rank";
import { listBadges } from "@/lib/badges/compute";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  wallet: string;
  x_handle: string | null;
  x_name: string | null;
  x_avatar_url: string | null;
  x_id: string | null;
  anon_name: string | null;
  country: string | null;
  thesis: string | null;
  board_rank: number | null;
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
  banner_updated_at: Date | null;
  followers_count: string;
  following_count: string;
  is_following: boolean;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ entries: [], error: "Database not configured" });
  const sp = req.nextUrl.searchParams;
  const range = (["7d", "30d", "all"].includes(sp.get("range") || "") ? sp.get("range") : "30d") as Range;
  // Each sort is its own leaderboard: ranks are computed here per metric (PnL, fees, volume, win rate).
  const sort = (["pnl", "fees", "volume", "winrate"].includes(sp.get("sort") || "") ? sp.get("sort") : "pnl") as Sort;
  const countryRaw = (sp.get("country") || "").toUpperCase();
  const country = countryRaw && isCountryCode(countryRaw) ? countryRaw : null;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 500);
  const cols = LEADERBOARD_COLS[range];
  // Members without Meteora activity are unranked (see HAS_DATA_SQL in lib/leaderboard-rank.ts).
  const hasData = HAS_DATA_SQL;
  // scope=following narrows the whole board (not just the loaded page) to people the viewer follows.
  const scopeFollowing = sp.get("scope") === "following";
  const viewerId = await getSessionUserId();
  if (scopeFollowing && !viewerId) {
    return NextResponse.json({ error: "Sign in to see who you follow" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const scope = scopeFollowing ? viewerId : null;
  // $4 = viewer id when scoped to Following, else null (whole board).
  const scopeWhere = `($4::int is null or exists(select 1 from follows sf where sf.follower_user_id = $4 and sf.followee_user_id = u.id))`;

  // Column names come from a fixed whitelist above; user values are bound parameters.
  // Rank over the whole (country-filtered) board first, then apply the Following scope, so a
  // followed LP keeps their global rank.
  const sql = `
    with latest as (
      select distinct on (user_id) * from pnl_snapshots order by user_id, date desc
    ), ranked as (
      select s.*, u.id as uid, ${hasData} as has_data,
             row_number() over (order by ${boardOrderSql(range, sort)}) as board_pos
      from latest s
      join users u on u.id = s.user_id
      where u.joined_at is not null and ($1::text is null or u.country = $1)
    )
    select u.id, u.wallet, u.x_handle, u.x_name, u.x_avatar_url, u.x_id, u.anon_name, u.country, u.thesis,
           case when s.has_data then s.board_pos::int end as board_rank,
           s.date::text as date, ${cols.pnl} as pnl, ${cols.volume} as volume, ${cols.winrate} as win_rate,
           ${cols.fees} as fees, s.total_pnl_usd, s.portfolio_value_usd, s.positions_open, s.positions_closed,
           s.top_pool_address, s.top_pool_name, s.top_pool_bin_step, s.top_pool_protocol,
           s.top_pool_x_icon, s.top_pool_y_icon, s.updated_at, pb.updated_at as banner_updated_at,
           (select count(*) from follows f join users fu on fu.id = f.follower_user_id
             where f.followee_user_id = u.id and (fu.joined_at is not null or fu.id = $3)) as followers_count,
           (select count(*) from follows f join users fu on fu.id = f.followee_user_id
             where f.follower_user_id = u.id and (fu.joined_at is not null or fu.id = $3)) as following_count,
           ($3::int is not null and exists(select 1 from follows where follower_user_id = $3 and followee_user_id = u.id)) as is_following
    from ranked s
    join users u on u.id = s.uid
    left join profile_banners pb on pb.user_id = u.id
    where ${scopeWhere}
    order by s.board_pos asc
    limit $2`;

  const pool = getPool();
  // Viewer-specific: whether the signed-in user (wallet or X session) follows each entry.
  const { rows } = await pool.query<Row>(sql, [country, limit, viewerId, scope]);
  // Badges for the listed members (one query; the board is members-only).
  const badgesByUser = await listBadges(rows.map((r) => r.id));

  const entries = rows.map((r) => ({
    rank: r.board_rank === null ? null : Number(r.board_rank),
    id: r.id,
    xHandle: r.x_handle,
    xName: r.x_name,
    xAvatarUrl: r.x_avatar_url,
    xVerified: Boolean(r.x_id && r.x_handle),
    anonName: r.anon_name,
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
    followingCount: Number(r.following_count || 0),
    isFollowing: Boolean(r.is_following),
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
    bannerUpdatedAt: r.banner_updated_at instanceof Date ? r.banner_updated_at.toISOString() : null,
    badges: badgesByUser.get(r.id) ?? [],
  }));

  return NextResponse.json({
    range,
    sort,
    country,
    scope: scopeFollowing ? "following" : "all",
    entries,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
