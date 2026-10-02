import { Connection, PublicKey, type AccountInfo } from "@solana/web3.js";

/**
 * Liquidity shape of open DLMM positions, read straight from the chain with plain account reads
 * (getMultipleAccounts), so the free public RPC is enough: no getProgramAccounts, no Meteora SDK
 * (its Anchor/spl-token deps carry unfixed advisories).
 *
 * Offsets are the DLMM program's zero-copy (packed) layouts, verified byte-for-byte against
 * @meteora-ag/dlmm 1.9.14 (wrapPosition / decodeAccount) on live positions of 31-186 bins.
 */

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// PositionV2: 8 discriminator, lb_pair @8, owner @40, liquidity_shares [u128; 70] @72,
// reward_infos / fee_infos (70 x 48 bytes each), lower_bin_id @7912, upper_bin_id @7916; 8120 bytes.
// Extended positions append one 112-byte record per bin beyond 70, liquidity_share (u128) first.
const POSITION_DISC = Buffer.from([117, 176, 212, 199, 245, 180, 133, 182]);
const POSITION_BASE_SIZE = 8120;
const SHARES_OFF = 72;
const LOWER_OFF = 7912;
const UPPER_OFF = 7916;
const BASE_BINS = 70;
const EXT_BIN_SIZE = 112;
// LbPair: 8 discriminator, StaticParameters (32), VariableParameters (32), bump (1), bin_step_seed (2),
// pair_type (1), active_id (i32) @76.
const LB_PAIR_DISC = Buffer.from([33, 11, 49, 98, 181, 101, 177, 13]);
const ACTIVE_ID_OFF = 76;

/** At most this many bars per position (bins are summed into buckets). */
export const SHAPE_BARS = 40;
const MAX_ACCOUNTS_PER_CALL = 100;
// One request per sync; the public RPC can take several seconds. On timeout the previous shape is kept.
const TIMEOUT_MS = 12_000;

/** Stored with each position detail: bar heights 0-100 (lowest price first) and where the price is. */
export interface PositionShape {
  bars: number[];
  /** Pool price within the position's bin range: 0 = lowest bin, 1 = highest; outside 0..1 when out of range. */
  active: number;
}

interface DecodedPosition {
  lbPair: string;
  lower: number;
  upper: number;
  shares: number[];
}

const u128 = (b: Buffer, o: number) => Number(b.readBigUInt64LE(o) + (b.readBigUInt64LE(o + 8) << BigInt(64)));

function decodePosition(data: Buffer): DecodedPosition | null {
  if (data.length < POSITION_BASE_SIZE || !data.subarray(0, 8).equals(POSITION_DISC)) return null;
  const lower = data.readInt32LE(LOWER_OFF);
  const upper = data.readInt32LE(UPPER_OFF);
  const n = upper - lower + 1;
  if (n < 1 || data.length < POSITION_BASE_SIZE + Math.max(0, n - BASE_BINS) * EXT_BIN_SIZE) return null;
  const shares: number[] = [];
  for (let i = 0; i < n; i++) {
    shares.push(i < BASE_BINS ? u128(data, SHARES_OFF + 16 * i) : u128(data, POSITION_BASE_SIZE + EXT_BIN_SIZE * (i - BASE_BINS)));
  }
  return { lbPair: new PublicKey(data.subarray(8, 40)).toBase58(), lower, upper, shares };
}

function activeIdOf(data: Buffer): number | null {
  if (data.length < ACTIVE_ID_OFF + 4 || !data.subarray(0, 8).equals(LB_PAIR_DISC)) return null;
  return data.readInt32LE(ACTIVE_ID_OFF);
}

function toShape(p: DecodedPosition, activeId: number): PositionShape | null {
  const n = p.shares.length;
  const buckets = Math.min(SHAPE_BARS, n);
  // Average (not sum) per bucket: buckets cover 3 or 4 bins when n doesn't divide evenly.
  const sums = Array.from({ length: buckets }, (_, b) => {
    const from = Math.floor((b * n) / buckets);
    const to = Math.floor(((b + 1) * n) / buckets);
    let s = 0;
    for (let i = from; i < to; i++) s += p.shares[i];
    return s / Math.max(1, to - from);
  });
  const max = Math.max(...sums);
  if (!(max > 0)) return null;
  return {
    bars: sums.map((s) => Math.round((s / max) * 100)),
    active: Number(((activeId - p.lower + 0.5) / n).toFixed(4)),
  };
}

async function getAccounts(conn: Connection, keys: string[]): Promise<(AccountInfo<Buffer> | null)[]> {
  const out: (AccountInfo<Buffer> | null)[] = [];
  for (let i = 0; i < keys.length; i += MAX_ACCOUNTS_PER_CALL) {
    out.push(...(await conn.getMultipleAccountsInfo(keys.slice(i, i + MAX_ACCOUNTS_PER_CALL).map((k) => new PublicKey(k)))));
  }
  return out;
}

/**
 * Shapes for open positions (best effort): positions that are closed, unreadable or empty are simply
 * missing from the map, and any RPC failure or timeout returns an empty map. Each position comes
 * with its pool address (known from Meteora's API), so positions and pools are read in one request.
 */
export async function fetchPositionShapes(positions: { address: string; poolAddress: string }[]): Promise<Map<string, PositionShape>> {
  const addrs = [...new Set(positions.map((p) => p.address))];
  if (addrs.length === 0) return new Map();
  const pools = [...new Set(positions.map((p) => p.poolAddress))];
  const work = async () => {
    const shapes = new Map<string, PositionShape>();
    const conn = new Connection(RPC_URL, { commitment: "confirmed", disableRetryOnRateLimit: true });
    const accounts = await getAccounts(conn, [...addrs, ...pools]);
    const active = new Map<string, number>();
    pools.forEach((pool, i) => {
      const a = accounts[addrs.length + i];
      const id = a ? activeIdOf(a.data) : null;
      if (id != null) active.set(pool, id);
    });
    addrs.forEach((addr, i) => {
      const a = accounts[i];
      const p = a ? decodePosition(a.data) : null;
      const id = p ? active.get(p.lbPair) : undefined;
      const shape = p && id != null ? toShape(p, id) : null;
      if (shape) shapes.set(addr, shape);
    });
    return shapes;
  };
  try {
    // A late result after the timeout is dropped (work() fills its own map).
    return await Promise.race([work(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS))]);
  } catch (e) {
    console.warn(`[position-shape] ${e instanceof Error ? e.message : e}`);
    return new Map();
  }
}
