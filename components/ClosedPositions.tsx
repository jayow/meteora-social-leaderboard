"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import type { ApiUser } from "@/lib/api-types";
import type { ClosedPool, ClosedPositionsPage } from "@/lib/closed-positions";
import { fmtPositions, fmtUsd, timeAgo } from "@/lib/format";
import { binLabel } from "@/components/ui";
import { NUM, PnL, PoolIcons, PoolName } from "@/components/OpenPositions";
import { SharePnLModal } from "@/components/SharePnLModal";

/**
 * Positions a member closed in the last 30 days, live from Meteora (/api/users/:id/closed-positions),
 * one compact row per pool: when it closed, PnL on the capital, and a Share button for that result.
 */


const closedAgo = (t: number) => timeAgo(new Date(t * 1000).toISOString());

export function ClosedPositions({ user, mine = false }: { user: ApiUser; mine?: boolean }) {
  const [pools, setPools] = useState<ClosedPool[] | null>(null);
  const [totalPools, setTotalPools] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ClosedPool | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const bodyId = useId();

  const fetchPage = useCallback(
    async (offset: number): Promise<ClosedPositionsPage> => {
      const r = await fetch(`/api/users/${user.id}/closed-positions?offset=${offset}`, { cache: "no-store" });
      const j = (await r.json()) as ClosedPositionsPage & { error?: string };
      if (!r.ok) throw new Error(j.error || "Couldn't load closed positions");
      return j;
    },
    [user.id]
  );

  useEffect(() => {
    let cancelled = false;
    setPools(null);
    setError(null);
    fetchPage(0)
      .then((j) => {
        if (cancelled) return;
        setPools(j.pools);
        setTotalPools(j.totalPools);
        setNextOffset(j.nextOffset);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (nextOffset == null) return;
    setLoadingMore(true);
    try {
      const j = await fetchPage(nextOffset);
      setPools((prev) => [...(prev ?? []), ...j.pools]);
      setTotalPools(j.totalPools);
      setNextOffset(j.nextOffset);
    } catch {
      // keep what's shown; the button stays for a retry
    } finally {
      setLoadingMore(false);
    }
  };

  const header = (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-lg font-semibold">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="flex items-center gap-2 rounded-tag text-left transition hover:text-fg-secondary"
          data-testid="closed-positions-toggle"
        >
          <span>Closed positions</span>
          <span className="chip">30D</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-mute transition-transform ${collapsed ? "-rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h2>
      {pools && totalPools > 0 && (
        <span className="num text-sm text-mute" data-testid="closed-positions-count">
          {totalPools} pool{totalPools === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );

  if (error) {
    return (
      <section data-testid="closed-positions">
        {header}
        <div id={bodyId} hidden={collapsed}>
          <p className="text-base text-mute">{error}</p>
        </div>
      </section>
    );
  }

  if (!pools) {
    return (
      <section data-testid="closed-positions">
        {header}
        <div id={bodyId} hidden={collapsed} className="space-y-1" aria-busy="true" aria-label="Loading closed positions">
          {[0, 1].map((i) => (
            <div key={i} className="h-[68px] py-3">
              <div className="flex items-center gap-3">
                <span className="skeleton h-8 w-14 rounded-full" />
                <div className="space-y-1.5">
                  <span className="skeleton block h-4 w-28" />
                  <span className="skeleton block h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (pools.length === 0) {
    return (
      <section data-testid="closed-positions">
        {header}
        <p id={bodyId} hidden={collapsed} className="text-base text-mute">{mine ? "You haven't closed a position in the last 30 days." : "No positions closed in the last 30 days."}</p>
      </section>
    );
  }

  return (
    <section data-testid="closed-positions">
      {header}
      <div id={bodyId} hidden={collapsed}>
      <div className="space-y-1">
        {pools.map((pool) => (
          <ClosedPoolRow key={pool.poolAddress} pool={pool} onShare={() => setSharing(pool)} />
        ))}
      </div>
      {nextOffset != null && (
        <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-ghost mt-3 w-full" data-testid="closed-positions-more">
          {loadingMore ? "Loading…" : `Show more (${totalPools - nextOffset} more pool${totalPools - nextOffset === 1 ? "" : "s"})`}
        </button>
      )}
      </div>
      {sharing && (
        <SharePnLModal
          user={user}
          isOpen
          position={{ poolAddress: sharing.poolAddress, name: `${sharing.tokenX}-${sharing.tokenY}`, pnlUsd: sharing.pnlUsd, pnlPct: sharing.pnlPct }}
          onClose={() => setSharing(null)}
        />
      )}
    </section>
  );
}

function ClosedPoolRow({ pool, onShare }: { pool: ClosedPool; onShare: () => void }) {
  const count = pool.positions.length;
  const pair = `${pool.tokenX}-${pool.tokenY}`;
  return (
    <div className="group relative -mx-3 flex items-center gap-3 rounded-tile px-3 py-3 transition hover:bg-accent-tint" data-testid="closed-position-row">
      <Link href={`/pools/${pool.poolAddress}`} aria-label={`${pair} pool`} className="absolute inset-0 rounded-tile" />
      <PoolIcons pool={pool} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-md font-semibold leading-tight">
          <PoolName pool={pool} />
        </div>
        <div className="num mt-1 truncate text-sm text-mute">
          {pool.binStep != null ? `${binLabel(pool.binStep)} · ` : ""}
          <span title={`Closed ${new Date(pool.lastClosedAt * 1000).toLocaleString()}`}>{closedAgo(pool.lastClosedAt)}</span>
          {count > 1 ? ` · ${fmtPositions(count)}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <PnL usd={pool.pnlUsd} pct={pool.pnlPct} className="text-md font-semibold" />
        <div className={`${NUM} mt-1 text-sm text-mute`}>on {fmtUsd(pool.capitalUsd)}</div>
      </div>
      <button
        type="button"
        onClick={onShare}
        className="btn-ghost relative z-10 h-9 w-9 shrink-0 px-0"
        aria-label={`Share ${pair} result`}
        title="Share"
        data-testid="closed-position-share"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 3v10M6 7l4-4 4 4M4 12v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
    </div>
  );
}
