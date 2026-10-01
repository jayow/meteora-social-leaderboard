export interface PoolInfo {
  address: string;
  name: string;
  binStep: number | null;
  protocol: string | null;
  xIcon: string | null;
  yIcon: string | null;
}

export interface LeaderboardEntry {
  /** Board rank; null for members with no Meteora activity yet (listed last, never on the podium). */
  rank: number | null;
  id: number;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  xVerified: boolean;
  /** Generated beach/pool display name ("Salty Flamingo"), used when there's no X handle. */
  anonName: string | null;
  country: string | null;
  thesis: string | null;
  pnl: number | null;
  volume: number | null;
  winRate: number | null;
  fees: number | null;
  totalPnl: number | null;
  portfolioValue: number | null;
  positionsOpen: number | null;
  positionsClosed: number | null;
  followersCount?: number;
  followingCount?: number;
  topPool: PoolInfo | null;
  snapshotDate: string;
  updatedAt: string;
  bannerUpdatedAt: string | null;
  /** Whether the signed-in viewer follows this LP (from /api/leaderboard). */
  isFollowing?: boolean;
}

export interface LeaderboardResponse {
  range: "7d" | "30d" | "all";
  sort: "pnl" | "volume" | "winrate" | "fees";
  country: string | null;
  /** "following" when the board is scoped to people the viewer follows (server-side). */
  scope?: "all" | "following";
  entries: LeaderboardEntry[];
  stats: { lps: number; totalPnl: number; fees: number } | null;
  error?: string;
}

export interface ApiUser {
  id: number;
  wallet?: string;
  signupMethod?: "wallet" | "x" | null;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  xVerified: boolean;
  anonName: string | null;
  country: string | null;
  thesis: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
  memberNumber?: number | null;
  bannerUpdatedAt?: string | null;
  followersCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
  walletCount?: number;
}

export interface ApiSnapshot {
  date: string;
  totalPnlUsd: number | null;
  pnl7d: number | null;
  pnl30d: number | null;
  volumeUsd: number | null;
  volume7dUsd: number | null;
  volume30dUsd: number | null;
  feesUsd: number | null;
  fees30dUsd: number | null;
  winRate: number | null;
  winRate7d: number | null;
  winRate30d: number | null;
  positionsOpen: number | null;
  positionsClosed: number | null;
  portfolioValueUsd: number | null;
  topPool: PoolInfo | null;
  updatedAt: string;
}
