"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApiUser } from "@/lib/api-types";
import type { ClosedPool, ClosedPositionsSummary } from "@/lib/closed-positions";
import { fmtPositions, fmtUsd, timeAgo } from "@/lib/format";
import { binLabel } from "@/components/ui";
import { NUM, PnL, PoolIcons, PoolName } from "@/components/OpenPositions";
import { SharePnLModal } from "@/components/SharePnLModal";

/**
 * Positions a member closed in the last 30 days, live from Meteora (/api/users/:id/closed-positions),
 * one compact row per pool: when it closed, PnL on the capital, and a Share button for that result.
 */

const INITIAL_POOLS = 8;

const closedAgo = (t: number) => timeAgo(new Date(t * 1000).toISOString());

export function ClosedPositions({ user, mine = false }: { user: ApiUser; mine?: boolean }) {
  const [data, setData] = useState<ClosedPositionsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sharing, setSharing] = useState<ClosedPool | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/users/${user.id}/closed-positions`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as ClosedPositionsSummary & { error?: string };
        if (cancelled) return;
        if (!r.ok) setError(j.error || "Couldn't load closed positions");
        else setData(j);
      })
      .catch(() => !cancelled && setError("Couldn't load closed positions"));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const header = (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="flex items-baseline gap-2 text-lg font-semibold">
        <span>
          Closed positions{data ? <span className="num font-medium text-mute"> {data.positionCount}</span> : null}
        </span>
        <span className="chip self-center">30D</span>
      </h2>
      {data && data.pools.length > 0 && (
        <span className="text-sm text-mute">
          PnL <PnL usd={data.pnlUsd} pct={null} className="text-sm" />
        </span>
      )}
    </div>
  );

  if (error) {
    return (
      <section data-testid="closed-positions">
        {header}
        <p className="text-base text-mute">{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section data-testid="closed-positions">
        {header}
        <div className="space-y-1" aria-busy="true" aria-label="Loading closed positions">
          {[0, 1].map((i) => (
            <div key={i} className="h-[84px] py-4">
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

  if (data.pools.length === 0) {
    return (
      <section data-testid="closed-positions">
        {header}
        <p className="text-base text-mute">{mine ? "You haven't closed a position in the last 30 days." : "No positions closed in the last 30 days."}</p>
      </section>
    );
  }

  const visible = showAll ? data.pools : data.pools.slice(0, INITIAL_POOLS);
  return (
    <section data-testid="closed-positions">
      {header}
      <div className="space-y-1">
        {visible.map((pool) => (
          <ClosedPoolRow key={pool.poolAddress} pool={pool} onShare={() => setSharing(pool)} />
        ))}
      </div>
      {data.pools.length > INITIAL_POOLS && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-ghost mt-3 w-full">
          {showAll ? "Show fewer" : `Show all ${data.pools.length} pools`}
        </button>
      )}
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
