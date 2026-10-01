import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { follows, pnlSnapshots, users, userWallets, type SnapshotRow, type UserRow } from "@/lib/db/schema";

export interface XFields {
  xId?: string | null;
  xHandle?: string | null;
  xName?: string | null;
  xAvatarUrl?: string | null;
}

/**
 * Existing account that owns `wallet`, as its primary wallet or a linked one. Never creates a row:
 * accounts are created only by a real sign-in (wallet signature or X OAuth) or by the operator.
 */
export async function findUserByWallet(wallet: string): Promise<UserRow | null> {
  const db = getDb();
  const [primary] = await db.select().from(users).where(eq(users.wallet, wallet)).limit(1);
  if (primary) return primary;
  const [linked] = await db
    .select({ user: users })
    .from(userWallets)
    .innerJoin(users, eq(users.id, userWallets.userId))
    .where(eq(userWallets.address, wallet))
    .limit(1);
  return linked?.user ?? null;
}

/** Create-or-update by wallet. Only call from sign-in (verified signature) or operator paths. */
export async function upsertUser(wallet: string, x?: XFields): Promise<UserRow> {
  const db = getDb();
  const xSet: Partial<UserRow> = {};
  if (x?.xHandle) {
    xSet.xId = x.xId ?? null;
    xSet.xHandle = x.xHandle.replace(/^@/, "");
    xSet.xName = x.xName ?? null;
    xSet.xAvatarUrl = x.xAvatarUrl ?? null;
  }
  const rows = await db
    .insert(users)
    .values({ wallet, signupMethod: 'wallet', ...xSet })
    .onConflictDoUpdate({ target: users.wallet, set: { ...xSet, updatedAt: sql`now()` } })
    .returning();
  return rows[0];
}

/**
 * Public lookup by user id or X handle only. Wallet addresses are deliberately NOT resolved here,
 * so URLs like /profile/<wallet> or /api/users/<wallet> can't map a wallet to an account.
 * (Server-side flows that start from a verified wallet use findUserByWallet.)
 */
export async function findUser(idOrHandle: string): Promise<UserRow | null> {
  const db = getDb();
  const key = idOrHandle.trim().replace(/^@/, "");
  if (/^\d+$/.test(key)) {
    const r = await db.select().from(users).where(eq(users.id, Number(key))).limit(1);
    if (r[0]) return r[0];
  }
  if (/^[A-Za-z0-9_]{1,30}$/.test(key)) {
    const byHandle = await db.select().from(users).where(ilike(users.xHandle, key)).orderBy(desc(users.updatedAt)).limit(1);
    if (byHandle[0]) return byHandle[0];
  }
  return null;
}

export async function latestSnapshot(userId: number): Promise<SnapshotRow | null> {
  const db = getDb();
  const r = await db.select().from(pnlSnapshots).where(eq(pnlSnapshots.userId, userId)).orderBy(desc(pnlSnapshots.date)).limit(1);
  return r[0] || null;
}

export interface PublicSnapshot {
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
  topPool: PublicPool | null;
  updatedAt: string;
}

export interface PublicPool {
  address: string;
  name: string;
  binStep: number | null;
  protocol: string | null;
  xIcon: string | null;
  yIcon: string | null;
}

export interface PublicUser {
  id: number;
  wallet?: string;
  signupMethod?: "wallet" | "x" | null;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  xVerified: boolean;
  /** Generated beach/pool display name, shown when there's no X handle. */
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
}

export function toPublicUser(u: UserRow, includeWallet = false): PublicUser {
  return {
    id: u.id,
    ...(includeWallet ? { wallet: u.wallet } : {}),
    signupMethod: u.signupMethod as "wallet" | "x" | null,
    xHandle: u.xHandle,
    xName: u.xName,
    xAvatarUrl: u.xAvatarUrl,
    xVerified: Boolean(u.xId && u.xHandle),
    anonName: u.anonName,
    country: u.country,
    thesis: u.thesis,
    createdAt: u.createdAt.toISOString(),
    lastSyncedAt: u.lastSyncedAt ? u.lastSyncedAt.toISOString() : null,
    ...(u.memberNumber ? { memberNumber: u.memberNumber } : {}),
    ...(u.bannerUpdatedAt ? { bannerUpdatedAt: u.bannerUpdatedAt.toISOString() } : {}),
  };
}

export function toPublicPool(s: Pick<SnapshotRow, "topPoolAddress" | "topPoolName" | "topPoolBinStep" | "topPoolProtocol" | "topPoolXIcon" | "topPoolYIcon">): PublicPool | null {
  if (!s.topPoolAddress || !s.topPoolName) return null;
  return {
    address: s.topPoolAddress,
    name: s.topPoolName,
    binStep: s.topPoolBinStep,
    protocol: s.topPoolProtocol,
    xIcon: s.topPoolXIcon,
    yIcon: s.topPoolYIcon,
  };
}

export function toPublicSnapshot(s: SnapshotRow): PublicSnapshot {
  return {
    date: s.date,
    totalPnlUsd: s.totalPnlUsd,
    pnl7d: s.pnl7d,
    pnl30d: s.pnl30d,
    volumeUsd: s.volumeUsd,
    volume7dUsd: s.volume7dUsd,
    volume30dUsd: s.volume30dUsd,
    feesUsd: s.feesUsd,
    fees30dUsd: s.fees30dUsd,
    winRate: s.winRate,
    winRate7d: s.winRate7d,
    winRate30d: s.winRate30d,
    positionsOpen: s.positionsOpen,
    positionsClosed: s.positionsClosed,
    portfolioValueUsd: s.portfolioValueUsd,
    topPool: toPublicPool(s),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/**
 * SQL condition: the other side of a follow is visible to `viewerId` (joined members are public;
 * a not-yet-joined account only counts/appears for itself). Keeps counts and lists consistent.
 */
function visibleTo(userIdCol: typeof users.id, viewerId: number | null) {
  return viewerId
    ? sql`(${users.joinedAt} is not null or ${userIdCol} = ${viewerId})`
    : sql`${users.joinedAt} is not null`;
}

export async function getFollowCounts(
  userId: number,
  viewerId: number | null = null
): Promise<{ followersCount: number; followingCount: number }> {
  const db = getDb();
  const [followersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followerUserId))
    .where(and(eq(follows.followeeUserId, userId), visibleTo(users.id, viewerId)));
  const [followingResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeUserId))
    .where(and(eq(follows.followerUserId, userId), visibleTo(users.id, viewerId)));
  return {
    followersCount: followersResult?.count ?? 0,
    followingCount: followingResult?.count ?? 0,
  };
}

export type FollowListKind = "followers" | "following";

export interface FollowListItem extends PublicUser {
  followedAt: string;
  /** Whether the viewer follows this person (drives the Follow/Following button). */
  isFollowing: boolean;
}

/** Followers of / people followed by `userId`, newest first, visible to `viewerId`. Never includes wallets. */
export async function getFollowList(
  userId: number,
  kind: FollowListKind,
  viewerId: number | null,
  limit: number,
  offset: number
): Promise<FollowListItem[]> {
  const db = getDb();
  const otherSide = kind === "followers" ? follows.followerUserId : follows.followeeUserId;
  const thisSide = kind === "followers" ? follows.followeeUserId : follows.followerUserId;
  const rows = await db
    .select({
      user: users,
      followedAt: follows.createdAt,
      isFollowing: viewerId
        ? sql<boolean>`exists(select 1 from follows vf where vf.follower_user_id = ${viewerId} and vf.followee_user_id = ${users.id})`
        : sql<boolean>`false`,
    })
    .from(follows)
    .innerJoin(users, eq(users.id, otherSide))
    .where(and(eq(thisSide, userId), visibleTo(users.id, viewerId)))
    .orderBy(desc(follows.createdAt), desc(follows.id))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    ...toPublicUser(r.user),
    followedAt: r.followedAt.toISOString(),
    isFollowing: Boolean(r.isFollowing),
  }));
}

export async function isUserFollowing(followerId: number | null, followeeId: number): Promise<boolean> {
  if (!followerId) return false;
  const db = getDb();
  const result = await db
    .select()
    .from(follows)
    .where(sql`${follows.followerUserId} = ${followerId} AND ${follows.followeeUserId} = ${followeeId}`)
    .limit(1);
  return result.length > 0;
}

/**
 * All wallet addresses that belong to a user: the primary `users.wallet` (unless it's an X-signup
 * `temp_` placeholder) plus any linked rows in `user_wallets`, primary first, de-duplicated.
 * New wallet signups only have `users.wallet` (no `user_wallets` row), so callers must not rely on
 * `user_wallets` alone.
 */
export async function getUserWalletAddresses(user: Pick<UserRow, "id" | "wallet">): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ address: userWallets.address })
    .from(userWallets)
    .where(eq(userWallets.userId, user.id))
    .orderBy(desc(userWallets.isPrimary), userWallets.createdAt);
  const out: string[] = [];
  const add = (a: string | null | undefined) => {
    if (a && !a.startsWith("temp_") && !out.includes(a)) out.push(a);
  };
  add(user.wallet);
  for (const r of rows) add(r.address);
  return out;
}

/**
 * Make sure a user has a generated beach/pool display name. New rows get one from the column default
 * (`pp_random_anon_name()`, see drizzle/0012); this covers older X users who unlink X. The DB function
 * already retries on collision; we also retry if a concurrent insert grabbed the same name.
 */
export async function ensureAnonName(user: UserRow): Promise<UserRow> {
  if (user.anonName) return user;
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [updated] = await db
        .update(users)
        .set({ anonName: sql`coalesce(${users.anonName}, pp_random_anon_name())` })
        .where(eq(users.id, user.id))
        .returning();
      return updated ?? user;
    } catch (err: unknown) {
      const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
      if (code !== "23505") throw err;
    }
  }
  return user;
}
