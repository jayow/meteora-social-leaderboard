import type { ApiBadge } from "@/lib/badges/config";

export type { ApiBadge };

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
  /** Earned badges, display-sorted (lib/badges). */
  badges?: ApiBadge[];
}

export interface LeaderboardResponse {
  range: "7d" | "30d" | "all";
  sort: "pnl" | "fees" | "volume" | "winrate";
  country: string | null;
  /** "following" when the board is scoped to people the viewer follows (server-side). */
  scope?: "all" | "following";
  entries: LeaderboardEntry[];
  error?: string;
}

/** One country on the Countries board (/api/leaderboard/countries). */
export interface CountryLeaderboardEntry {
  /** Rank for the active metric; null when nobody in the country has a value for it (e.g. no closed positions for win rate). */
  rank: number | null;
  /** ISO 3166-1 alpha-2 code. */
  country: string;
  /** Total PnL / fees / volume, or the average win rate (0-1), for the active metric and range. */
  value: number | null;
  /** Joined members with Meteora activity in this country. */
  members: number;
  /** Members counted in the win-rate average (those with closed positions). */
  winRateMembers: number;
  /** The country's best member for the active metric. */
  topLp: { id: number; xHandle: string | null; xName: string | null; xAvatarUrl: string | null; anonName: string | null; value: number | null } | null;
}

export interface CountryLeaderboardResponse {
  range: "7d" | "30d" | "all";
  sort: "pnl" | "fees" | "volume" | "winrate";
  entries: CountryLeaderboardEntry[];
  /** Active members without a country (not on the Countries board). */
  noCountryMembers: number;
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
  /** DLMM pools this member created, per profile range (counts only). */
  poolsCreated?: { "1d": number; "7d": number; "30d": number; all: number };
}

export interface ApiSnapshot {
  date: string;
  totalPnlUsd: number | null;
  pnl1d: number | null;
  pnl7d: number | null;
  pnl30d: number | null;
  volumeUsd: number | null;
  volume1dUsd: number | null;
  volume7dUsd: number | null;
  volume30dUsd: number | null;
  feesUsd: number | null;
  fees1dUsd: number | null;
  fees7dUsd: number | null;
  fees30dUsd: number | null;
  winRate: number | null;
  winRate1d: number | null;
  winRate7d: number | null;
  winRate30d: number | null;
  positionsOpen: number | null;
  positionsClosed: number | null;
  portfolioValueUsd: number | null;
  topPool: PoolInfo | null;
  updatedAt: string;
}
