import { desc, eq, ilike, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { follows, pnlSnapshots, users, userWallets, type SnapshotRow, type UserRow } from "@/lib/db/schema";

export interface XFields {
  xId?: string | null;
  xHandle?: string | null;
  xName?: string | null;
  xAvatarUrl?: string | null;
}

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

export async function findUser(idOrWalletOrHandle: string): Promise<UserRow | null> {
  const db = getDb();
  const key = idOrWalletOrHandle.trim().replace(/^@/, "");
  if (/^\d+$/.test(key)) {
    const r = await db.select().from(users).where(eq(users.id, Number(key))).limit(1);
    if (r[0]) return r[0];
  }
  const byWallet = await db.select().from(users).where(eq(users.wallet, key)).limit(1);
  if (byWallet[0]) return byWallet[0];
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

export async function getFollowCounts(userId: number): Promise<{ followersCount: number; followingCount: number }> {
  const db = getDb();
  const [followersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followeeUserId, userId));
  const [followingResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followerUserId, userId));
  return {
    followersCount: followersResult?.count ?? 0,
    followingCount: followingResult?.count ?? 0,
  };
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

export async function getUserWalletCount(userId: number): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  return result[0]?.count ?? 0;
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
