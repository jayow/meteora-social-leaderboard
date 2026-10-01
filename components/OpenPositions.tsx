"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { fmtPct, fmtPositions, fmtUsd, pnlClass, timeAgo } from "@/lib/format";
import { DipLink } from "@/components/DipLink";
import type { OpenPositionDetail } from "@/lib/db/schema";

/** One row per pool; `positionCount` = the user's open positions in that pool. Mirrors lib/open-positions.ts. */
interface OpenPool {
  poolAddress: string;
  binStep: number | null;
  protocol: string | null;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenYMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  valueUsd: number | null;
  positionCount: number;
  /** Per-position details (no addresses); null when the last sync didn't fetch them. */
  positions?: OpenPositionDetail[] | null;
}

interface OpenPositionsResponse {
  positions?: OpenPool[];
  totalPositions?: number;
  poolCount?: number;
}

interface OpenPositionsData {
  pools: OpenPool[];
  totalPositions: number;
}

/** Numbers: Inter with tabular figures (same token as the PnL calendar). */
const NUM = "font-numeric tabular-nums";

/** Pools shown before "Show all" on the full list. */
const INITIAL_POOLS = 8;

/**
 * A user's open positions from their last sync: the same rows the profile's "Open positions" stat is
 * counted from, so the header count, the per-pool counts and that stat always agree. Several positions
 * in one pool are one row labelled "N positions".
 *
 * `refreshKey` (e.g. the snapshot's updatedAt) refetches after a sync finishes.
 */
export function OpenPositions({ userId, compact, mine = false, refreshKey }: { userId?: number; compact?: boolean; mine?: boolean; refreshKey?: string | null }) {
  const [data, setData] = useState<OpenPositionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // One toggle (on the section header) shows or hides the per-position rows of every pool.
  const [open, setOpen] = useState(false);
  const panelBase = useId();

  useEffect(() => {
    if (!userId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/users/${userId}/open-positions`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch open positions");
        const json = (await res.json()) as OpenPositionsResponse;
        if (cancelled) return;
        const pools = Array.isArray(json.positions) ? json.positions : [];
        setData({
          pools,
          totalPositions: json.totalPositions ?? pools.reduce((sum, p) => sum + (p.positionCount || 1), 0),
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Could not load open positions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  if (!userId) return null;

  const total = data?.totalPositions ?? 0;
  const poolCount = data?.pools.length ?? 0;
  // Spell out the grouping only when some pool holds several positions (otherwise rows = positions).
  const summary = data && total > poolCount ? `${fmtPositions(total)} in ${poolCount} pool${poolCount === 1 ? "" : "s"}` : null;

  const visible = data ? (showAll ? data.pools : data.pools.slice(0, INITIAL_POOLS)) : [];
  const panelIds = visible.filter(hasPositionRows).map((p) => `${panelBase}-${p.poolAddress}`);
  const title = (
    <>
      Open Positions{data ? <span className="num"> ({total})</span> : null}
    </>
  );

  const header = (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-[18px] font-extrabold">
        {!compact && panelIds.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelIds.join(" ")}
            className="flex items-center gap-2 rounded text-left hover:text-fg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mute"
            data-testid="open-positions-toggle-details"
          >
            <span>{title}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`h-4 w-4 shrink-0 text-mute transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          title
        )}
      </h2>
      {summary && (
        <span className="num text-[12px] text-mute" data-testid="open-positions-summary">
          {summary}
        </span>
      )}
    </div>
  );

  if (!data && loading) {
    return (
      <div className="glass rounded-[28px] p-5" data-testid="open-positions">
        {header}
        <p className="text-[12px] text-mute">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-[28px] p-5" data-testid="open-positions">
        {header}
        <p className="text-[12px] text-dn">{error}</p>
      </div>
    );
  }

  if (!data || data.pools.length === 0) {
    return (
      <div className="glass rounded-[28px] p-5" data-testid="open-positions">
        {header}
        <p className="text-[13px] text-mute">{mine ? "You have no open positions right now." : "No open positions right now."}</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="glass rounded-[28px] p-5" data-testid="open-positions">
        {header}
        <div className="space-y-2">
          {data.pools.slice(0, 3).map((pool) => (
            <PositionCardCompact key={pool.poolAddress} pool={pool} />
          ))}
        </div>
        {data.pools.length > 3 && (
          <p className="mt-2 text-[11px] text-mute">
            +{data.pools.length - 3} more pool{data.pools.length - 3 === 1 ? "" : "s"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-[28px] p-5" data-testid="open-positions">
      {header}
      <div className="space-y-3">
        {visible.map((pool) => (
          <PositionCard key={pool.poolAddress} pool={pool} open={open} panelId={`${panelBase}-${pool.poolAddress}`} />
        ))}
      </div>
      {data.pools.length > INITIAL_POOLS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full rounded-xl py-2 text-[13px] font-semibold text-mute hover:bg-surface-raised hover:text-fg"
          data-testid="open-positions-toggle"
        >
          {showAll ? "Show fewer" : `Show all ${data.pools.length} pools`}
        </button>
      )}
    </div>
  );
}

function PoolIcons({ pool, size }: { pool: OpenPool; size: "sm" | "md" }) {
  const dim = size === "md" ? "h-8 w-8" : "h-6 w-6";
  const overlap = size === "md" ? "-ml-2" : "-ml-1.5";
  return (
    <div className="flex shrink-0 items-center">
      {pool.tokenXIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pool.tokenXIcon} alt={pool.tokenX} className={`${dim} rounded-full border border-surface bg-surface-raised object-cover`} />
      ) : (
        <div className={`${dim} rounded-full border border-surface bg-surface-raised`} />
      )}
      {pool.tokenYIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pool.tokenYIcon} alt={pool.tokenY} className={`${overlap} ${dim} rounded-full border border-surface bg-surface-raised object-cover`} />
      ) : (
        <div className={`${overlap} ${dim} rounded-full border border-surface bg-surface-raised`} />
      )}
    </div>
  );
}

function PoolName({ pool }: { pool: OpenPool }) {
  return (
    <>
      {pool.tokenXMint ? (
        <Link href={`/pools?token=${pool.tokenXMint}`} className="relative z-10 hover:underline">
          {pool.tokenX}
        </Link>
      ) : (
        <span>{pool.tokenX}</span>
      )}
      <span>/</span>
      {pool.tokenYMint ? (
        <Link href={`/pools?token=${pool.tokenYMint}`} className="relative z-10 hover:underline">
          {pool.tokenY}
        </Link>
      ) : (
        <span>{pool.tokenY}</span>
      )}
    </>
  );
}

/** Range bound, quote per base: 4 significant digits without exponent noise for normal sizes. */
function fmtPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a < 1e-6) return n.toExponential(2);
  return String(Number(n.toPrecision(4)));
}

/* ------------------------------------------------------------------------------------------------ */
/* Range bars                                                                                        */
/* ------------------------------------------------------------------------------------------------ */

interface PriceScale {
  lo: number;
  hi: number;
}

const finitePos = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0;

/**
 * One log scale (DLMM bins are geometric) covering every position's range and the pool price, so
 * several positions in a pool line up and overlaps read at a glance. Null if any bound is missing.
 */
function priceScale(details: OpenPositionDetail[]): PriceScale | null {
  const xs: number[] = [];
  for (const d of details) {
    if (!finitePos(d.minPrice) || !finitePos(d.maxPrice)) return null;
    xs.push(d.minPrice, d.maxPrice);
    if (finitePos(d.poolPrice)) xs.push(d.poolPrice);
  }
  if (xs.length === 0) return null;
  let lo = Math.log10(Math.min(...xs));
  let hi = Math.log10(Math.max(...xs));
  if (hi - lo < 1e-9) {
    lo -= 0.05;
    hi += 0.05;
  }
  const pad = (hi - lo) * 0.04;
  return { lo: lo - pad, hi: hi + pad };
}

const at = (scale: PriceScale, x: number) => Math.min(100, Math.max(0, ((Math.log10(x) - scale.lo) / (scale.hi - scale.lo)) * 100));

function poolPriceOf(details: OpenPositionDetail[]): number | null {
  for (const d of details) if (finitePos(d.poolPrice)) return d.poolPrice;
  return null;
}

/** Thin track with the position's range filled and a tick at the pool's current price; bounds underneath. */
function RangeBar({ d, scale, unit }: { d: OpenPositionDetail; scale: PriceScale | null; unit: string }) {
  if (!scale || !finitePos(d.minPrice) || !finitePos(d.maxPrice)) {
    return (
      <span className={`${NUM} text-[11px] text-mute`}>
        {fmtPrice(d.minPrice)} – {fmtPrice(d.maxPrice)}
      </span>
    );
  }
  const a = at(scale, d.minPrice);
  const b = at(scale, d.maxPrice);
  const p = finitePos(d.poolPrice) ? at(scale, d.poolPrice) : null;
  const min = fmtPrice(d.minPrice);
  const max = fmtPrice(d.maxPrice);
  // Narrow ranges get one combined label so the two bounds don't collide.
  const split = b - a >= 36;
  const label = `Range ${min} to ${max} ${unit}${p != null ? `, current ${fmtPrice(d.poolPrice ?? null)}` : ""}, ${d.inRange ? "in range" : "out of range"}`;
  return (
    <div role="img" aria-label={label} className="min-w-0">
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
        <div
          className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full ${d.inRange ? "bg-up/70" : "bg-mute/40"}`}
          style={{ left: `${a}%`, width: `${Math.max(b - a, 1.5)}%` }}
        />
        {p != null && (
          <div
            className={`absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${d.inRange ? "bg-fg" : "bg-dn"}`}
            style={{ left: `${p}%` }}
          />
        )}
      </div>
      <div className={`${NUM} relative mt-1 h-3.5 whitespace-nowrap text-[11px] leading-none text-mute`} aria-hidden="true">
        {split ? (
          <>
            <span className="absolute" style={{ left: `${a}%` }}>
              {min}
            </span>
            <span className="absolute" style={{ right: `${100 - b}%` }}>
              {max}
            </span>
          </>
        ) : a < 50 ? (
          <span className="absolute" style={{ left: `${a}%` }}>
            {min} – {max}
          </span>
        ) : (
          <span className="absolute" style={{ right: `${100 - b}%` }}>
            {min} – {max}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Pool card                                                                                         */
/* ------------------------------------------------------------------------------------------------ */

/** PnL as a fraction of what was deposited (Meteora's basis), or null when the basis isn't known. */
function pnlFraction(pnl: number | null, deposit: number | null | undefined): number | null {
  return pnl != null && deposit != null && deposit > 0 ? pnl / deposit : null;
}

function PnL({ usd, pct, className = "" }: { usd: number | null; pct: number | null; className?: string }) {
  if (usd == null) return <span className={`${NUM} text-mute ${className}`}>—</span>;
  return (
    <span className={`${NUM} ${pnlClass(usd)} ${className}`} title={pct != null ? "PnL vs. deposits" : "PnL"}>
      {fmtUsd(usd, { signed: true })}
      {pct != null && (
        <span className="ml-1.5 opacity-60">
          {pct >= 0 ? "+" : "−"}
          {fmtPct(Math.abs(pct), 1)}
        </span>
      )}
    </span>
  );
}

/** Row stats from the positions (only when every position's details are in, so totals are whole). */
function poolTotals(pool: OpenPool) {
  const details = pool.positions ?? [];
  const count = pool.positionCount || 1;
  if (details.length === 0 || details.length !== count) return null;
  const fees = details.reduce((s, d) => s + d.unclaimedFeesUsd, 0);
  const pnl = details.every((d) => d.pnlUsd != null) ? details.reduce((s, d) => s + (d.pnlUsd ?? 0), 0) : null;
  const deposit = details.every((d) => finitePos(d.depositUsd)) ? details.reduce((s, d) => s + (d.depositUsd ?? 0), 0) : null;
  return { fees, pnl, pct: pnlFraction(pnl, deposit), inRange: details.filter((d) => d.inRange).length, count };
}

/** Desktop column template shared by the column header and each position row. */
const COLS = "sm:grid sm:grid-cols-[minmax(0,1fr)_4.75rem_4.25rem_6.75rem_2.75rem] sm:items-center sm:gap-x-4";

/** One position: shared-scale range bar, then value / fees / PnL / age (stacked under the bar on phones). */
function PositionRow({ d, scale, unit }: { d: OpenPositionDetail; scale: PriceScale | null; unit: string }) {
  const opened = d.openedAt != null ? new Date(d.openedAt * 1000) : null;
  return (
    <div className={`py-3 text-[13px] ${COLS}`} data-testid="open-position-line">
      <RangeBar d={d} scale={scale} unit={unit} />
      <div className={`${NUM} mt-2.5 flex items-baseline gap-3 sm:contents`}>
        <span className="font-medium text-fg sm:text-right">
          <span className="sr-only">Value </span>
          {fmtUsd(d.valueUsd)}
        </span>
        <span className="text-mute sm:text-right" title="Unclaimed fees">
          <span className="mr-1 font-sans text-[12px] sm:sr-only">Fees</span>
          {fmtUsd(d.unclaimedFeesUsd)}
        </span>
        <span className="ml-auto sm:ml-0 sm:text-right">
          <span className="sr-only">PnL </span>
          <PnL usd={d.pnlUsd} pct={d.pnlPct ?? pnlFraction(d.pnlUsd, d.depositUsd)} />
        </span>
        <span className="w-9 text-right text-mute sm:w-auto" title={opened ? `Opened ${opened.toLocaleString()}` : undefined}>
          <span className="sr-only">opened </span>
          {opened ? timeAgo(opened.toISOString()).replace(" ago", "") : "—"}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`shrink-0 ${className}`}>
      <div className="text-[12px] text-mute">{label}</div>
      <div className={`${NUM} mt-0.5 whitespace-nowrap text-[15px] font-semibold leading-tight`}>{children}</div>
    </div>
  );
}

/** Pools with several positions list a row each (shown via the section header's toggle). */
function hasPositionRows(pool: OpenPool): boolean {
  return (pool.positionCount || 1) > 1 && (pool.positions ?? []).length > 0;
}

function PositionCard({ pool, open, panelId }: { pool: OpenPool; open: boolean; panelId: string }) {
  const count = pool.positionCount || 1;
  const details = pool.positions ?? [];
  const pair = `${pool.tokenX}/${pool.tokenY}`;
  const unit = `${pool.tokenY} per ${pool.tokenX}`;
  const totals = poolTotals(pool);
  const scale = priceScale(details);
  const price = poolPriceOf(details);
  // Pools with several positions list a row each; a single position shows its range bar inline.
  const expandable = hasPositionRows(pool);
  return (
    <div className="relative rounded-2xl border border-border bg-surface-raised p-4 transition hover:border-border-strong" data-testid="open-position-row">
      {/* Whole-card overlay (not a wrapper) so the token links aren't nested in it. */}
      <Link href={`/pools/${pool.poolAddress}`} aria-label={`${pair} pool, ${fmtPositions(count)}`} className="absolute inset-0 rounded-2xl" />

      <div className="flex items-center gap-3 pr-16">
        <PoolIcons pool={pool} size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold leading-tight">
              <PoolName pool={pool} />
            </span>
            {pool.binStep != null && (
              <span className="shrink-0 rounded-full border border-border px-2 py-px text-[11px] leading-4 text-mute" title="DLMM bin step">{pool.binStep}bp</span>
            )}
          </div>
          <div className="num mt-1 flex items-center gap-1.5 whitespace-nowrap text-[12px] text-mute">
            <span data-testid="pool-position-count">{fmtPositions(count)}</span>
            {totals && (
              <>
                <span aria-hidden="true">·</span>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${totals.inRange === totals.count ? "bg-up" : totals.inRange === 0 ? "bg-dn" : "bg-mute"}`} aria-hidden="true" />
                <span>
                  {count > 1 ? `${totals.inRange}/${totals.count} in range` : totals.inRange ? "In range" : "Out of range"}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div className="flex min-w-0 flex-1 items-end gap-5 sm:gap-10">
          <Stat label="Value">
            <span className="text-fg">{fmtUsd(pool.valueUsd ?? 0)}</span>
          </Stat>
          {totals && (
            <>
              <Stat label="Fees">
                <span className="text-fg-secondary">{fmtUsd(totals.fees)}</span>
              </Stat>
              <Stat label="PnL">
                <PnL usd={totals.pnl} pct={totals.pct} />
              </Stat>
            </>
          )}
        </div>
      </div>

      {count === 1 && details.length === 1 && scale && (
        <div className="mt-4 border-t border-border pt-3">
          <RangeBar d={details[0]} scale={scale} unit={unit} />
        </div>
      )}

      {expandable && (
        // Above the overlay so clicks inside the list don't open the pool page.
        <div id={panelId} hidden={!open} className="relative z-10 mt-4 border-t border-border pt-3" data-testid="open-position-details">
          {price != null && scale && (
            <div className="flex items-center gap-1.5 text-[12px] text-mute">
              <span className="h-2.5 w-0.5 rounded-full bg-fg" aria-hidden="true" />
              <span>
                Current price <span className={`${NUM} text-fg-secondary`}>{fmtPrice(price)}</span> {unit}
              </span>
            </div>
          )}
          <div className={`mt-3 hidden text-[12px] text-mute ${COLS}`} aria-hidden="true">
            <span>Range</span>
            <span className="text-right">Value</span>
            <span className="text-right">Fees</span>
            <span className="text-right">PnL</span>
            <span className="text-right">Age</span>
          </div>
          <ul className="divide-y divide-border">
            {details.map((d, i) => (
              <li key={i}>
                <PositionRow d={d} scale={scale} unit={unit} />
              </li>
            ))}
          </ul>
          {details.length !== count && (
            <p className="pt-1 text-[12px] text-mute">
              Details for {details.length} of {fmtPositions(count)}; the rest appear after the next sync.
            </p>
          )}
          <Link href={`/pools/${pool.poolAddress}`} className="mt-2 inline-block whitespace-nowrap rounded text-[12px] font-semibold text-mute transition hover:text-fg">
            View pool →
          </Link>
        </div>
      )}

      <DipLink poolAddress={pool.poolAddress} protocol={pool.protocol} className="!absolute right-4 top-4" />
    </div>
  );
}

function PositionCardCompact({ pool }: { pool: OpenPool }) {
  const count = pool.positionCount || 1;
  return (
    <div className="relative flex items-center justify-between gap-2 rounded-xl border border-border bg-bg p-3 transition hover:border-border-strong">
      <Link href={`/pools/${pool.poolAddress}`} aria-label={`${pool.tokenX}/${pool.tokenY} pool, ${fmtPositions(count)}`} className="absolute inset-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <PoolIcons pool={pool} size="sm" />
        <div className="ml-1 min-w-0">
          <div className="truncate text-[13px] font-semibold">
            <PoolName pool={pool} />
          </div>
          <div className={`${NUM} text-[11px] text-mute`}>
            {fmtUsd(pool.valueUsd ?? 0)} · {fmtPositions(count)}
          </div>
        </div>
      </div>
      <DipLink poolAddress={pool.poolAddress} protocol={pool.protocol} />
    </div>
  );
}
