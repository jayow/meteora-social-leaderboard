import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import type { CountryLeaderboardEntry, CountryLeaderboardResponse } from "@/lib/api-types";
// Same snapshot columns and "has data" rule as the members board.
import { HAS_DATA_SQL as HAS_DATA, LEADERBOARD_COLS, type LeaderboardRange, type LeaderboardSort } from "@/lib/leaderboard-rank";

export const dynamic = "force-dynamic";

type Range = LeaderboardRange;
type Sort = LeaderboardSort;

interface Row {
  country: string;
  members: number;
  value: number | null;
  win_rate_members: number;
  board_rank: string | null;
  top_id: number | null;
  top_x_handle: string | null;
  top_x_name: string | null;
  top_x_avatar_url: string | null;
  top_anon_name: string | null;
  top_value: number | null;
}

/**
 * Countries board: one row per country of joined, active members (same rule as the members board).
 * PnL / fees / volume are totals; win rate is the average over members with closed positions.
 * Ranked server-side per metric; ties break on member count, then country code.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const range = (["7d", "30d", "all"].includes(sp.get("range") || "") ? sp.get("range") : "30d") as Range;
  const sort = (["pnl", "fees", "volume", "winrate"].includes(sp.get("sort") || "") ? sp.get("sort") : "pnl") as Sort;
  if (!hasDb()) {
    const empty: CountryLeaderboardResponse = { range, sort, entries: [], noCountryMembers: 0, error: "Database not configured" };
    return NextResponse.json(empty);
  }
  const cols = LEADERBOARD_COLS[range];
  // Per-member value for the active metric (win rate only counts members with closed positions).
  const memberValue = sort === "winrate" ? "win_rate" : sort;
  const aggregate = sort === "winrate" ? "avg(win_rate)" : `sum(${sort})`;

  // Column names come from fixed whitelists above; nothing user-supplied is interpolated.
  const sql = `
    with latest as (
      select distinct on (user_id) * from pnl_snapshots order by user_id, date desc
    ), active as (
      select u.id, u.x_handle, u.x_name, u.x_avatar_url, u.anon_name, u.country,
             ${cols.pnl} as pnl, ${cols.fees} as fees, ${cols.volume} as volume,
             case when coalesce(s.positions_closed, 0) > 0 then ${cols.winrate} end as win_rate
      from latest s
      join users u on u.id = s.user_id
      where u.joined_at is not null and ${HAS_DATA}
    ), agg as (
      select country, count(*)::int as members, ${aggregate} as value, count(win_rate)::int as win_rate_members
      from active where country is not null
      group by country
    ), top as (
      select distinct on (country) country, id, x_handle, x_name, x_avatar_url, anon_name, ${memberValue} as value
      from active where country is not null
      order by country, ${memberValue} desc nulls last, pnl desc nulls last, id asc
    )
    select a.country, a.members, a.value, a.win_rate_members,
           case when a.value is not null
             then row_number() over (order by a.value desc nulls last, a.members desc, a.country asc) end as board_rank,
           t.id as top_id, t.x_handle as top_x_handle, t.x_name as top_x_name, t.x_avatar_url as top_x_avatar_url,
           t.anon_name as top_anon_name, t.value as top_value
    from agg a
    left join top t on t.country = a.country
    order by a.value desc nulls last, a.members desc, a.country asc`;

  const pool = getPool();
  const [{ rows }, noCountry] = await Promise.all([
    pool.query<Row>(sql),
    pool.query<{ n: number }>(
      `with latest as (select distinct on (user_id) * from pnl_snapshots order by user_id, date desc)
       select count(*)::int as n from latest s join users u on u.id = s.user_id
       where u.joined_at is not null and u.country is null and ${HAS_DATA}`,
    ),
  ]);

  const entries: CountryLeaderboardEntry[] = rows.map((r) => ({
    rank: r.board_rank === null ? null : Number(r.board_rank),
    country: r.country,
    value: r.value === null ? null : Number(r.value),
    members: r.members,
    winRateMembers: r.win_rate_members,
    topLp:
      r.top_id === null
        ? null
        : {
            id: r.top_id,
            xHandle: r.top_x_handle,
            xName: r.top_x_name,
            xAvatarUrl: r.top_x_avatar_url,
            anonName: r.top_anon_name,
            value: r.top_value === null ? null : Number(r.top_value),
          },
  }));

  const body: CountryLeaderboardResponse = { range, sort, entries, noCountryMembers: noCountry.rows[0]?.n ?? 0 };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
