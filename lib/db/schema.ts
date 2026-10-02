import {
  pgTable,
  serial,
  integer,
  boolean,
  text,
  varchar,
  timestamp,
  date,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profileBanners = pgTable(
  "profile_banners",
  {
    userId: integer("user_id").primaryKey().notNull().references(() => users.id, { onDelete: "cascade" }),
    mime: varchar("mime", { length: 32 }).notNull(),
    data: text("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 8 }).notNull(),
    createdByUserId: integer("created_by_user_id"),
    maxUses: integer("max_uses").notNull().default(1),
    uses: integer("uses").notNull().default(0),
    disabled: integer("disabled").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invite_codes_code_key").on(t.code),
    index("invite_codes_created_by_idx").on(t.createdByUserId),
  ]
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    wallet: varchar("wallet", { length: 64 }).notNull(),
    signupMethod: varchar("signup_method", { length: 16 }),
    xId: varchar("x_id", { length: 64 }),
    xHandle: varchar("x_handle", { length: 64 }),
    xName: text("x_name"),
    xAvatarUrl: text("x_avatar_url"),
    avatarCheckedAt: timestamp("avatar_checked_at", { withTimezone: true }),
    country: varchar("country", { length: 2 }),
    thesis: text("thesis"),
    invitedByUserId: integer("invited_by_user_id"),
    inviteCodeId: integer("invite_code_id"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    memberNumber: integer("member_number"),
    /**
     * Opt-in: show this member's position activity (opened / closed / big win) on Poolside. Off by
     * default. Events are always stored; reads only show those at/after `sharePositionActivitySince`
     * (reset on every opt-in), so nothing from before opting in - or from while opted out - surfaces.
     */
    sharePositionActivity: boolean("share_position_activity").notNull().default(false),
    sharePositionActivitySince: timestamp("share_position_activity_since", { withTimezone: true }),
    /** When the member answered (or dismissed) the one-time post-join sharing prompt. */
    positionSharingAskedAt: timestamp("position_sharing_asked_at", { withTimezone: true }),
    /**
     * Fun, unique beach/pool display name ("Salty Flamingo") shown instead of an LP number when the
     * user has no X handle. Filled by the DB default `pp_random_anon_name()` (see drizzle/0012).
     */
    anonName: varchar("anon_name", { length: 64 }).default(sql`pp_random_anon_name()`),
    termsVersionAccepted: varchar("terms_version_accepted", { length: 32 }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    bannerUpdatedAt: timestamp("banner_updated_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    /** Sessions issued before this are rejected (set on sign-out: signs out every device). */
    sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_wallet_key").on(t.wallet),
    uniqueIndex("users_member_number_key").on(t.memberNumber),
    uniqueIndex("users_anon_name_key").on(t.anonName),
    index("users_x_handle_idx").on(t.xHandle),
    index("users_x_id_idx").on(t.xId),
    index("users_country_idx").on(t.country),
    index("users_joined_at_idx").on(t.joinedAt),
    index("users_last_synced_at_idx").on(t.lastSyncedAt.asc()),
    index("users_last_attempted_at_idx").on(t.lastAttemptedAt),
  ]
);

export const userWallets = pgTable(
  "user_wallets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 64 }).notNull(),
    label: text("label"),
    isPrimary: integer("is_primary").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_wallets_address_key").on(t.address),
    index("user_wallets_user_id_idx").on(t.userId),
    index("user_wallets_user_primary_idx").on(t.userId, t.isPrimary),
  ]
);

export const pnlSnapshots = pgTable(
  "pnl_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalPnlUsd: doublePrecision("total_pnl_usd"),
    pnl7d: doublePrecision("pnl_7d"),
    pnl30d: doublePrecision("pnl_30d"),
    volumeUsd: doublePrecision("volume_usd"),
    volume7dUsd: doublePrecision("volume_7d_usd"),
    volume30dUsd: doublePrecision("volume_30d_usd"),
    feesUsd: doublePrecision("fees_usd"),
    fees7dUsd: doublePrecision("fees_7d_usd"),
    fees30dUsd: doublePrecision("fees_30d_usd"),
    winRate: doublePrecision("win_rate"),
    winRate7d: doublePrecision("win_rate_7d"),
    winRate30d: doublePrecision("win_rate_30d"),
    positionsOpen: integer("positions_open"),
    positionsClosed: integer("positions_closed"),
    portfolioValueUsd: doublePrecision("portfolio_value_usd"),
    topPoolAddress: varchar("top_pool_address", { length: 64 }),
    topPoolName: text("top_pool_name"),
    topPoolBinStep: integer("top_pool_bin_step"),
    topPoolProtocol: varchar("top_pool_protocol", { length: 16 }),
    topPoolXIcon: text("top_pool_x_icon"),
    topPoolYIcon: text("top_pool_y_icon"),
    source: jsonb("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pnl_snapshots_user_date_key").on(t.userId, t.date),
    index("pnl_snapshots_date_idx").on(t.date),
    index("pnl_snapshots_user_date_desc_idx").on(t.userId, t.date.desc()),
  ]
);

export const follows = pgTable(
  "follows",
  {
    id: serial("id").primaryKey(),
    followerUserId: integer("follower_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeUserId: integer("followee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("follows_follower_followee_key").on(t.followerUserId, t.followeeUserId),
    index("follows_follower_idx").on(t.followerUserId),
    index("follows_followee_idx").on(t.followeeUserId),
  ]
);

/** One open position inside an open_positions pool row (public, non-wallet fields only). */
export interface OpenPositionDetail {
  /** Range bounds, quote (token Y) per base (token X). */
  minPrice: number | null;
  maxPrice: number | null;
  inRange: boolean;
  /** Current value incl. unclaimed fees, USD (same definition as the pool row's value). */
  valueUsd: number;
  unclaimedFeesUsd: number;
  pnlUsd: number | null;
  /** Fraction (0.01 = 1%). */
  pnlPct: number | null;
  /** Unix seconds. */
  openedAt: number | null;
  /** Pool's active price at sync (same units as min/max). Optional: rows synced before it existed lack it. */
  poolPrice?: number | null;
  /** All-time deposits, USD: the basis for pnlPct. */
  depositUsd?: number | null;
}

export const openPositions = pgTable(
  "open_positions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    poolAddress: varchar("pool_address", { length: 64 }).notNull(),
    tokenX: text("token_x").notNull(),
    tokenY: text("token_y").notNull(),
    tokenXMint: varchar("token_x_mint", { length: 64 }),
    tokenYMint: varchar("token_y_mint", { length: 64 }),
    tokenXIcon: text("token_x_icon"),
    tokenYIcon: text("token_y_icon"),
    binStep: integer("bin_step"),
    protocol: varchar("protocol", { length: 16 }),
    valueUsd: doublePrecision("value_usd"),
    positionCount: integer("position_count"),
    /** Slim per-position details (lib/open-positions.ts OpenPositionDetail[]); never position/wallet addresses. */
    positions: jsonb("positions").$type<OpenPositionDetail[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("open_positions_user_pool_key").on(t.userId, t.poolAddress),
    index("open_positions_pool_idx").on(t.poolAddress),
    index("open_positions_user_idx").on(t.userId),
    index("open_positions_token_x_mint_idx").on(t.tokenXMint),
  ]
);

export const tokenComments = pgTable(
  "token_comments",
  {
    id: serial("id").primaryKey(),
    tokenMint: varchar("token_mint", { length: 64 }).notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** The author's pool this thesis is tagged with (one of their open positions in a pool of this token at post time). */
    poolAddress: varchar("pool_address", { length: 64 }),
    /** Pool label at post time ("SI-SOL"), so the tag survives the position closing. */
    poolName: text("pool_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("token_comments_mint_idx").on(t.tokenMint, t.createdAt.desc()),
    index("token_comments_user_idx").on(t.userId, t.createdAt.desc()),
    index("token_comments_created_idx").on(t.createdAt.desc(), t.id.desc()),
  ]
);

/**
 * Activity feed events. Written at sync (position opened/closed, big wins), comment, join and follow
 * time; backfilled from existing rows in drizzle/0013. `dedupe_key` makes every write idempotent.
 * Never stores wallet addresses. Only joined actors are shown (enforced at read time in lib/activity.ts).
 */
export const activity = pgTable(
  "activity",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** joined | followed | thesis | opened | closed | big_win | badge (badge + tier in dedupe_key, see lib/badges/config.ts) */
    kind: varchar("kind", { length: 24 }).notNull(),
    targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "cascade" }),
    poolAddress: varchar("pool_address", { length: 64 }),
    poolName: text("pool_name"),
    protocol: varchar("protocol", { length: 16 }),
    binStep: integer("bin_step"),
    tokenXIcon: text("token_x_icon"),
    tokenYIcon: text("token_y_icon"),
    tokenMint: varchar("token_mint", { length: 64 }),
    tokenSymbol: text("token_symbol"),
    commentId: integer("comment_id").references(() => tokenComments.id, { onDelete: "cascade" }),
    amountUsd: doublePrecision("amount_usd"),
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("activity_dedupe_key").on(t.dedupeKey),
    index("activity_occurred_idx").on(t.occurredAt.desc(), t.id.desc()),
    index("activity_actor_occurred_idx").on(t.actorUserId, t.occurredAt.desc()),
  ]
);

/** Likes on theses (token_comments). One per member per thesis; no replies. */
export const thesisLikes = pgTable(
  "thesis_likes",
  {
    id: serial("id").primaryKey(),
    commentId: integer("comment_id")
      .notNull()
      .references(() => tokenComments.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("thesis_likes_comment_user_key").on(t.commentId, t.userId),
    index("thesis_likes_user_idx").on(t.userId),
  ]
);

export type ProfileBannerRow = typeof profileBanners.$inferSelect;
export type InviteCodeRow = typeof inviteCodes.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type UserWalletRow = typeof userWallets.$inferSelect;
export type SnapshotRow = typeof pnlSnapshots.$inferSelect;
export type NewSnapshot = typeof pnlSnapshots.$inferInsert;
export type FollowRow = typeof follows.$inferSelect;
export type OpenPositionRow = typeof openPositions.$inferSelect;
export type TokenCommentRow = typeof tokenComments.$inferSelect;
export type ThesisLikeRow = typeof thesisLikes.$inferSelect;
export type ActivityRow = typeof activity.$inferSelect;
export type NewActivity = typeof activity.$inferInsert;

/**
 * Member badges (lib/badges). One row per member per badge; `tier` only ever goes up (1 = untiered or
 * the first tier). Rows are permanent: a badge is never removed or downgraded once earned.
 */
export const userBadges = pgTable(
  "user_badges",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Badge id from lib/badges/config.ts (first_splash, fee_farmer, ...). */
    badge: varchar("badge", { length: 32 }).notNull(),
    tier: integer("tier").notNull().default(1),
    /** What earned the current tier (metric value, threshold, podium tab/rank). Never wallet data. */
    evidence: jsonb("evidence"),
    /** First time the badge was earned (any tier). */
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the current tier was reached (equals earned_at until an upgrade). */
    tierEarnedAt: timestamp("tier_earned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_badges_user_badge_key").on(t.userId, t.badge)]
);

export type UserBadgeRow = typeof userBadges.$inferSelect;

/** Single-use nonces for wallet sign-in proofs (lib/wallet-proof.ts); a row is deleted when used. */
export const walletNonces = pgTable(
  "wallet_nonces",
  {
    nonce: varchar("nonce", { length: 64 }).primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("wallet_nonces_expires_at_idx").on(t.expiresAt)]
);
