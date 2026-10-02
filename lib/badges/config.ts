/**
 * Badge definitions and thresholds: the one place to tune them. Client-safe (no DB imports).
 *
 * Every badge uses a metric we already store from Meteora (pnl_snapshots) or our own DB:
 * - First Splash   positions_closed >= 1
 * - Fee Farmer     lifetime fees_usd (tiers)
 * - Whale Volume   lifetime volume_usd (= total deposits, tiers)
 * - Sharpshooter   lifetime win_rate with a minimum number of closed positions
 * - In the Green   total_pnl_usd > 0 with a minimum number of closed positions
 * - Pool Hopper    distinct pools LP'd (Meteora portfolio pool count + pools we've seen, tiers)
 * - Pool Builder   DLMM pools created by the member's wallets (on-chain creator, lib/created-pools.ts, tiers)
 * - Podium         top 3 on a 30D leaderboard tab (our server-side ranks, evaluated in the hourly cron)
 *
 * Tiers are 1-based and only ever go up. Tiered badges use bronze / silver / gold for tiers 1 / 2 / 3.
 * Podium's tier is the best finish: 3rd = 1 (bronze), 2nd = 2 (silver), 1st = 3 (gold).
 */

export const BADGE_IDS = [
  "podium",
  "fee_farmer",
  "whale_volume",
  "sharpshooter",
  "in_the_green",
  "pool_hopper",
  "pool_builder",
  "first_splash",
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

export type BadgeTier = 1 | 2 | 3;

/** 30D leaderboard tabs that count for Podium (same ids as /api/leaderboard?sort=). */
export const PODIUM_TABS = ["pnl", "fees", "volume", "winrate"] as const;
export type PodiumTab = (typeof PODIUM_TABS)[number];

export const PODIUM_TAB_LABEL: Record<PodiumTab, string> = {
  pnl: "PnL",
  fees: "Fees",
  volume: "Volume",
  winrate: "Win rate",
};

export const BADGE_THRESHOLDS = {
  firstSplash: { minClosed: 1 },
  /** Lifetime fees earned, USD, tiers 1..3. */
  feeFarmerUsd: [1_000, 10_000, 100_000],
  /** Lifetime volume (deposits), USD, tiers 1..3. */
  whaleVolumeUsd: [100_000, 1_000_000, 10_000_000],
  sharpshooter: { minWinRate: 0.7, minClosed: 20 },
  inTheGreen: { minClosed: 10 },
  /** Distinct pools LP'd, tiers 1..3. */
  poolHopperPools: [10, 25, 50],
  /** DLMM pools created, tiers 1..3. */
  poolBuilderPools: [1, 5, 20],
  /** Finish at or above this rank on a 30D tab. */
  podium: { maxRank: 3 },
} as const;

export interface BadgeDef {
  id: BadgeId;
  name: string;
  tiered: boolean;
}

export const BADGES: Record<BadgeId, BadgeDef> = {
  podium: { id: "podium", name: "Podium", tiered: true },
  fee_farmer: { id: "fee_farmer", name: "Fee Farmer", tiered: true },
  whale_volume: { id: "whale_volume", name: "Whale Volume", tiered: true },
  sharpshooter: { id: "sharpshooter", name: "Sharpshooter", tiered: false },
  in_the_green: { id: "in_the_green", name: "In the Green", tiered: false },
  pool_hopper: { id: "pool_hopper", name: "Pool Hopper", tiered: true },
  pool_builder: { id: "pool_builder", name: "Pool Builder", tiered: true },
  first_splash: { id: "first_splash", name: "First Splash", tiered: false },
};

export function isBadgeId(v: string): v is BadgeId {
  return (BADGE_IDS as readonly string[]).includes(v);
}

export function isPodiumTab(v: unknown): v is PodiumTab {
  return typeof v === "string" && (PODIUM_TABS as readonly string[]).includes(v);
}

export function clampTier(n: number): BadgeTier {
  return n >= 3 ? 3 : n <= 1 ? 1 : 2;
}

/** Badge as returned by the API (profile, leaderboard). No wallet data. */
export interface ApiBadge {
  id: BadgeId;
  tier: BadgeTier;
  /** ISO time the badge was first earned. */
  earnedAt: string;
  /** Podium only: the finish that earned the current tier. */
  podium?: { tab: PodiumTab; rank: number; date: string } | null;
}

function usdShort(v: number): string {
  if (v >= 1_000_000) return `$${v / 1_000_000}M`;
  if (v >= 1_000) return `$${v / 1_000}K`;
  return `$${v}`;
}

const RANK_WORD = ["", "1st", "2nd", "3rd"];

/** Tier label for tooltips ("Gold", "Tier 2 of 3", or null for untiered badges). */
export function tierLabel(id: BadgeId, tier: BadgeTier): string | null {
  if (!BADGES[id].tiered) return null;
  if (id === "podium") return ["", "Bronze · 3rd place", "Silver · 2nd place", "Gold · 1st place"][tier];
  return `${["", "Bronze", "Silver", "Gold"][tier]} · tier ${tier} of 3`;
}

/** One line on how the current tier was earned. */
export function howEarned(b: Pick<ApiBadge, "id" | "tier" | "podium">): string {
  const t = BADGE_THRESHOLDS;
  const i = b.tier - 1;
  switch (b.id) {
    case "first_splash":
      return "Closed a first LP position";
    case "fee_farmer":
      return `Earned ${usdShort(t.feeFarmerUsd[i])}+ in lifetime fees`;
    case "whale_volume":
      return `Deposited ${usdShort(t.whaleVolumeUsd[i])}+ in lifetime volume`;
    case "sharpshooter":
      return `Win rate of ${Math.round(t.sharpshooter.minWinRate * 100)}%+ over ${t.sharpshooter.minClosed}+ closed positions`;
    case "in_the_green":
      return `Positive all-time PnL over ${t.inTheGreen.minClosed}+ closed positions`;
    case "pool_hopper":
      return `LP'd in ${t.poolHopperPools[i]}+ different pools`;
    case "pool_builder":
      return t.poolBuilderPools[i] === 1 ? "Created a DLMM pool" : `Created ${t.poolBuilderPools[i]}+ DLMM pools`;
    case "podium":
      return b.podium
        ? `Finished ${RANK_WORD[b.podium.rank] ?? `#${b.podium.rank}`} on the 30D ${PODIUM_TAB_LABEL[b.podium.tab]} leaderboard`
        : `Finished ${RANK_WORD[4 - b.tier]} on a 30D leaderboard`;
  }
}

/**
 * Badges page copy: what each badge is for and its steps (tier 1, 2, 3 for tiered badges). Built from
 * BADGE_THRESHOLDS so the page never drifts from what the sync awards.
 */
export const BADGE_GUIDE: Record<BadgeId, { blurb: string; steps: string[] }> = {
  podium: { blurb: "Finish top 3 on any 30-day leaderboard: PnL, fees, volume or win rate.", steps: ["3rd place", "2nd place", "1st place"] },
  fee_farmer: { blurb: "Lifetime fees earned across your positions.", steps: BADGE_THRESHOLDS.feeFarmerUsd.map((v) => `${usdShort(v)} in fees`) },
  whale_volume: { blurb: "Lifetime volume you've deposited into pools.", steps: BADGE_THRESHOLDS.whaleVolumeUsd.map((v) => `${usdShort(v)} volume`) },
  pool_hopper: { blurb: "LP in many different pools.", steps: BADGE_THRESHOLDS.poolHopperPools.map((v) => `${v} pools`) },
  pool_builder: {
    blurb: "Create DLMM pools on Meteora.",
    steps: BADGE_THRESHOLDS.poolBuilderPools.map((v) => (v === 1 ? "1 pool created" : `${v} pools created`)),
  },
  sharpshooter: {
    blurb: `Keep a ${Math.round(BADGE_THRESHOLDS.sharpshooter.minWinRate * 100)}%+ win rate over ${BADGE_THRESHOLDS.sharpshooter.minClosed}+ closed positions.`,
    steps: [],
  },
  in_the_green: { blurb: `Stay positive on all-time PnL over ${BADGE_THRESHOLDS.inTheGreen.minClosed}+ closed positions.`, steps: [] },
  first_splash: { blurb: "Close your first LP position.", steps: [] },
};

/** Display order: highest tier first, then the BADGE_IDS order. */
export function sortBadges<T extends Pick<ApiBadge, "id" | "tier">>(badges: T[]): T[] {
  return [...badges].sort((a, b) => b.tier - a.tier || BADGE_IDS.indexOf(a.id) - BADGE_IDS.indexOf(b.id));
}

/**
 * Poolside "earned a badge" events are activity rows with kind "badge"; the badge and tier live in the
 * dedupe key (`badge:<userId>:<badgeId>:<tier>`), which also makes each tier announce at most once.
 */
export function badgeActivityKey(userId: number, id: BadgeId, tier: BadgeTier): string {
  return `badge:${userId}:${id}:${tier}`;
}

export function parseBadgeActivityKey(key: string): { id: BadgeId; tier: BadgeTier } | null {
  const [prefix, , id, tierStr] = key.split(":");
  const tier = Number(tierStr);
  if (prefix !== "badge" || !id || !isBadgeId(id) || !Number.isInteger(tier) || tier < 1 || tier > 3) return null;
  return { id, tier: clampTier(tier) };
}
