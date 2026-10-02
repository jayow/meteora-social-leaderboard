import { Connection, PublicKey } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { createdPools, users, type UserRow } from "@/lib/db/schema";
import { getUserWalletAddresses } from "@/lib/users";
import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";

/**
 * DLMM pools a member created: every LbPair account records its `creator` (newer pools; older ones
 * hold the system program), so one filtered getProgramAccounts per wallet finds them. The public RPC
 * allows this filtered query. Only counts leave the server (the list would reveal the wallet).
 */

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const DLMM_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
// LbPair (zero-copy): 904 bytes, creator pubkey at byte 848. Verified against @meteora-ag/dlmm 1.9.14.
const LB_PAIR_SIZE = 904;
const CREATOR_OFFSET = 848;
/** Rescan each member at most this often: pools are created rarely. */
const SCAN_EVERY_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

async function poolsCreatedBy(conn: Connection, wallet: string): Promise<string[]> {
  const accounts = await conn.getProgramAccounts(DLMM_PROGRAM, {
    dataSlice: { offset: 0, length: 0 },
    filters: [{ dataSize: LB_PAIR_SIZE }, { memcmp: { offset: CREATOR_OFFSET, bytes: wallet } }],
  });
  return accounts.map((a) => a.pubkey.toBase58());
}

/**
 * Find and store new pools created by the member's wallets. Best effort: an RPC failure leaves the
 * scan time unchanged so the next sync retries; never throws.
 */
export async function scanCreatedPools(user: Pick<UserRow, "id" | "wallet" | "seeded" | "createdPoolsCheckedAt">): Promise<void> {
  if (user.seeded) return;
  if (user.createdPoolsCheckedAt && Date.now() - user.createdPoolsCheckedAt.getTime() < SCAN_EVERY_MS) return;
  try {
    const wallets = (await getUserWalletAddresses(user)).filter((w) => {
      try {
        return PublicKey.isOnCurve(new PublicKey(w).toBytes());
      } catch {
        return false;
      }
    });
    const conn = new Connection(RPC_URL, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const scan = Promise.all(wallets.map((w) => poolsCreatedBy(conn, w)));
    const found = [...new Set((await Promise.race([scan, new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), TIMEOUT_MS))])).flat())];

    const db = getDb();
    const known = new Set(
      (await db.select({ a: createdPools.poolAddress }).from(createdPools).where(eq(createdPools.userId, user.id))).map((r) => r.a)
    );
    for (const address of found.filter((a) => !known.has(a))) {
      const pool = await fetchMeteoraOrNull<{ created_at?: number }>(meteoraUrls.pool(address)).catch(() => null);
      const createdAt = typeof pool?.created_at === "number" ? new Date(pool.created_at) : null;
      await db.insert(createdPools).values({ userId: user.id, poolAddress: address, poolCreatedAt: createdAt }).onConflictDoNothing();
    }
    await db.update(users).set({ createdPoolsCheckedAt: sql`now()` }).where(eq(users.id, user.id));
  } catch (e) {
    console.warn(`[created-pools] user ${user.id}: ${e instanceof Error ? e.message : e}`);
  }
}

export interface PoolsCreatedCounts {
  "1d": number;
  "7d": number;
  "30d": number;
  all: number;
}

/** Pools created per profile range (by Meteora's creation time; unknown dates count in All only). */
export async function poolsCreatedCounts(userId: number): Promise<PoolsCreatedCounts> {
  const { rows } = await getPool().query<{ d1: number; d7: number; d30: number; all: number }>(
    `SELECT count(*) FILTER (WHERE pool_created_at > now() - interval '1 day')::int AS d1,
            count(*) FILTER (WHERE pool_created_at > now() - interval '7 days')::int AS d7,
            count(*) FILTER (WHERE pool_created_at > now() - interval '30 days')::int AS d30,
            count(*)::int AS all
     FROM created_pools WHERE user_id = $1`,
    [userId]
  );
  const r = rows[0];
  return { "1d": r?.d1 ?? 0, "7d": r?.d7 ?? 0, "30d": r?.d30 ?? 0, all: r?.all ?? 0 };
}
