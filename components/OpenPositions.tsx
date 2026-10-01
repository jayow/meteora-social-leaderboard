"use client";

import { useEffect, useId, useState } from "react";
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

  const header = (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-[18px] font-extrabold">
        Open Positions{data ? <span className="num"> ({total})</span> : null}
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

  const visible = showAll ? data.pools : data.pools.slice(0, INITIAL_POOLS);
  return (
    <div className="glass rounded-[28px] p-5" data-testid="open-positions">
      {header}
      <div className="space-y-3">
        {visible.map((pool) => (
          <PositionCard key={pool.poolAddress} pool={pool} />
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

/** "4 positions" as a visible pill when a pool holds several, plain muted text for one. */
function PositionCount({ count }: { count: number }) {
  return count > 1 ? (
    <span className="num rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[11px] font-semibold text-fg" data-testid="pool-position-count">
      {fmtPositions(count)}
    </span>
  ) : (
    <span className="num text-[12px] text-mute" data-testid="pool-position-count">
      {fmtPositions(count)}
    </span>
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

/** One position: range with an in/out-of-range dot, value, unclaimed fees, PnL, opened. */
function PositionLine({ d, pool }: { d: OpenPositionDetail; pool: OpenPool }) {
  const value = fmtUsd(d.valueUsd);
  const opened = d.openedAt != null ? new Date(d.openedAt * 1000) : null;
  return (
    <div className="py-2 text-[12px] sm:flex sm:items-center sm:gap-4" data-testid="open-position-line">
      <div className="flex min-w-0 items-center justify-between gap-3 sm:flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            title={d.inRange ? "In range" : "Out of range"}
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.inRange ? "bg-up" : "bg-dn"}`}
          />
          <span className="sr-only">{d.inRange ? "In range" : "Out of range"}, range</span>
          <span className="num truncate text-fg-secondary" title={`Price range, ${pool.tokenY} per ${pool.tokenX}`}>
            {fmtPrice(d.minPrice)} – {fmtPrice(d.maxPrice)}
          </span>
        </span>
        <span className="num shrink-0 font-semibold sm:hidden">{value}</span>
      </div>
      <div className="num mt-0.5 flex items-center gap-3 pl-3.5 text-mute sm:mt-0 sm:shrink-0 sm:pl-0">
        <span className="hidden w-20 text-right font-semibold text-fg sm:inline">{value}</span>
        <span title="Unclaimed fees">fees {fmtUsd(d.unclaimedFeesUsd)}</span>
        {d.pnlUsd != null && (
          <span className={pnlClass(d.pnlUsd)} title={d.pnlPct != null ? `PnL ${fmtPct(d.pnlPct, 2)}` : "PnL"}>
            <span className="sr-only">PnL </span>
            {fmtUsd(d.pnlUsd, { signed: true })}
          </span>
        )}
        {opened && (
          <span title={`Opened ${opened.toLocaleString()}`}>
            <span className="sr-only">opened </span>
            {timeAgo(opened.toISOString())}
          </span>
        )}
      </div>
    </div>
  );
}

function PositionCard({ pool }: { pool: OpenPool }) {
  const count = pool.positionCount || 1;
  const details = pool.positions ?? [];
  const pair = `${pool.tokenX}/${pool.tokenY}`;
  // Pools with several positions expand to one line each; a single position shows its line inline.
  const expandable = count > 1 && details.length > 0;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="relative rounded-2xl border border-border bg-surface-raised p-4 transition hover:border-border-strong" data-testid="open-position-row">
      {/* Whole-card overlay (not a wrapper) so the token links aren't nested in it. */}
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${pair} pool, ${fmtPositions(count)}. ${open ? "Hide" : "Show"} positions`}
          className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mute"
          data-testid="open-position-expand"
        />
      ) : (
        <Link href={`/pools/${pool.poolAddress}`} aria-label={`${pair} pool, ${fmtPositions(count)}`} className="absolute inset-0 rounded-2xl" />
      )}
      <div className="flex items-start gap-2.5 pr-16">
        <PoolIcons pool={pool} size="md" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-bold">
              <PoolName pool={pool} />
            </span>
            {pool.binStep != null && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-mute">DLMM {pool.binStep}bp</span>
            )}
          </div>
          <div className="mt-1">
            <PositionCount count={count} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 text-[13px]">
        <div>
          <div className="text-[11px] text-mute">{count > 1 ? `Value across ${fmtPositions(count)}` : "Value"}</div>
          <div className="num mt-0.5 font-semibold">{fmtUsd(pool.valueUsd ?? 0)}</div>
        </div>
        {expandable && (
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`mb-0.5 h-4 w-4 shrink-0 text-mute transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {count === 1 && details.length === 1 && (
        <div className="mt-2 border-t border-border">
          <PositionLine d={details[0]} pool={pool} />
        </div>
      )}

      {expandable && (
        // Above the overlay so clicks inside the list don't collapse it.
        <div id={panelId} hidden={!open} className="relative z-10 mt-2 border-t border-border" data-testid="open-position-details">
          <ul className="divide-y divide-border">
            {details.map((d, i) => (
              <li key={i}>
                <PositionLine d={d} pool={pool} />
              </li>
            ))}
          </ul>
          {details.length !== count && (
            <p className="pt-1 text-[11px] text-mute">
              Details for {details.length} of {fmtPositions(count)}; the rest appear after the next sync.
            </p>
          )}
          <Link href={`/pools/${pool.poolAddress}`} className="mt-1 inline-block rounded text-[12px] font-semibold text-mute hover:text-fg">
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
          <div className="num text-[11px] text-mute">
            {fmtUsd(pool.valueUsd ?? 0)} · {fmtPositions(count)}
          </div>
        </div>
      </div>
      <DipLink poolAddress={pool.poolAddress} protocol={pool.protocol} />
    </div>
  );
}
