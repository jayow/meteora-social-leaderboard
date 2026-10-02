/**
 * Small pool facts shown next to a pool name (Poolside trades and LP ideas): how many bins a position
 * spans, and the pool's base fee. Server-only (the fee comes from Meteora).
 */
import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";
import type { OpenPositionDetail } from "@/lib/db/schema";

/** Bins a range spans: DLMM prices step by (1 + binStep / 10000) per bin. */
export function binsInRange(minPrice: number, maxPrice: number, binStep: number): number | null {
  if (!(minPrice > 0) || !(maxPrice >= minPrice) || !(binStep > 0)) return null;
  return Math.round(Math.log(maxPrice / minPrice) / Math.log(1 + binStep / 10000)) + 1;
}

/** Bins across positions (each one's range, summed); null unless every position's range is known. */
export function totalBins(positions: OpenPositionDetail[] | null | undefined, binStep: number | null): number | null {
  const ds = positions ?? [];
  if (ds.length === 0 || !binStep) return null;
  let bins = 0;
  for (const d of ds) {
    const b = binsInRange(d.minPrice ?? 0, d.maxPrice ?? 0, binStep);
    if (b == null) return null;
    bins += b;
  }
  return bins;
}

/** Pool base fee (percent) from Meteora, cached for hours: it's set at pool creation. Null if unknown. */
export async function poolBaseFeePct(poolAddress: string): Promise<number | null> {
  try {
    const pool = await fetchMeteoraOrNull<{ pool_config?: { base_fee_pct?: number } }>(meteoraUrls.pool(poolAddress), 6 * 60 * 60 * 1000);
    const v = pool?.pool_config?.base_fee_pct;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
