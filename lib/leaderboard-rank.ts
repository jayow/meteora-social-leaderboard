/**
 * Server-side leaderboard ranking SQL, shared by /api/leaderboard and the Podium badge pass
 * (lib/badges/compute.ts) so both use exactly the same ranks. Column names are a fixed whitelist.
 */

export type LeaderboardRange = "7d" | "30d" | "all";
export type LeaderboardSort = "pnl" | "fees" | "volume" | "winrate";

export const LEADERBOARD_COLS: Record<LeaderboardRange, Record<LeaderboardSort, string>> = {
  "7d": { pnl: "s.pnl_7d", volume: "s.volume_7d_usd", winrate: "s.win_rate_7d", fees: "s.fees_7d_usd" },
  "30d": { pnl: "s.pnl_30d", volume: "s.volume_30d_usd", winrate: "s.win_rate_30d", fees: "s.fees_30d_usd" },
  all: { pnl: "s.total_pnl_usd", volume: "s.volume_usd", winrate: "s.win_rate", fees: "s.fees_usd" },
};

/**
 * A member "has data" once their snapshot shows any Meteora LP activity. Members without data are
 * unranked (rank null), listed after everyone with data, and never take podium spots.
 */
export const HAS_DATA_SQL = `(coalesce(s.positions_open, 0) + coalesce(s.positions_closed, 0) > 0
      or coalesce(s.volume_usd, 0) <> 0 or coalesce(s.portfolio_value_usd, 0) <> 0 or coalesce(s.total_pnl_usd, 0) <> 0)`;

/** ORDER BY for one board (alias `s` = latest snapshot, `u` = users). Ties: PnL, then user id. */
export function boardOrderSql(range: LeaderboardRange, sort: LeaderboardSort): string {
  const cols = LEADERBOARD_COLS[range];
  return `${HAS_DATA_SQL} desc, ${cols[sort]} desc nulls last, ${cols.pnl} desc nulls last, u.id asc`;
}
