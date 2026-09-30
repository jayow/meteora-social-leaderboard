import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  date,
  doublePrecision,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

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
    bannerUpdatedAt: timestamp("banner_updated_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_wallet_key").on(t.wallet),
    uniqueIndex("users_member_number_key").on(t.memberNumber),
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
    tokenXIcon: text("token_x_icon"),
    tokenYIcon: text("token_y_icon"),
    binStep: integer("bin_step"),
    protocol: varchar("protocol", { length: 16 }),
    valueUsd: doublePrecision("value_usd"),
    positionCount: integer("position_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("open_positions_user_pool_key").on(t.userId, t.poolAddress),
    index("open_positions_pool_idx").on(t.poolAddress),
    index("open_positions_user_idx").on(t.userId),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("token_comments_mint_idx").on(t.tokenMint, t.createdAt.desc()),
    index("token_comments_user_idx").on(t.userId, t.createdAt.desc()),
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
