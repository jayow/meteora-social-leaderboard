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

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    wallet: varchar("wallet", { length: 64 }).notNull(),
    xId: varchar("x_id", { length: 64 }),
    xHandle: varchar("x_handle", { length: 64 }),
    xName: text("x_name"),
    xAvatarUrl: text("x_avatar_url"),
    avatarCheckedAt: timestamp("avatar_checked_at", { withTimezone: true }),
    country: varchar("country", { length: 2 }),
    thesis: text("thesis"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_wallet_key").on(t.wallet),
    index("users_x_handle_idx").on(t.xHandle),
    index("users_country_idx").on(t.country),
    index("users_last_synced_at_idx").on(t.lastSyncedAt.asc()),
    index("users_last_attempted_at_idx").on(t.lastAttemptedAt),
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

export type UserRow = typeof users.$inferSelect;
export type SnapshotRow = typeof pnlSnapshots.$inferSelect;
export type NewSnapshot = typeof pnlSnapshots.$inferInsert;
export type FollowRow = typeof follows.$inferSelect;
export type OpenPositionRow = typeof openPositions.$inferSelect;
