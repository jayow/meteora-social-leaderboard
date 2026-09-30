"use client";

import { useEffect, useState } from "react";
import { fmtUsd } from "@/lib/format";

interface MeteoraOpenPool {
  poolAddress: string;
  binStep: number;
  tokenX: string;
  tokenY: string;
  tokenXIcon: string;
  tokenYIcon: string;
  balances: string;
  pnl: string;
  pnlPctChange: string;
  unclaimedFees: string;
  outOfRange: boolean;
  openPositionCount: number;
}

interface MeteoraOpenPositions {
  totalPositions: number;
  pools: MeteoraOpenPool[];
}

function num(s: string | number | null | undefined): number {
  if (s == null) return 0;
  const n = typeof s === "string" ? parseFloat(s) : s;
  return Number.isFinite(n) ? n : 0;
}

export function OpenPositions({ walletAddress, compact }: { walletAddress?: string; compact?: boolean }) {
  const [data, setData] = useState<MeteoraOpenPositions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/meteora/open?wallet=${walletAddress}`);
        if (!res.ok) {
          throw new Error("Failed to fetch open positions");
        }
        const json = await res.json();
        if (!cancelled) {
          setData({
            totalPositions: json.totalPositions || 0,
            pools: Array.isArray(json.pools) ? json.pools : [],
          });
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Could not load open positions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  if (!walletAddress) {
    return null;
  }

  if (loading) {
    return (
      <div className="glass rounded-[28px] p-5">
        <h2 className="text-[14px] font-extrabold uppercase tracking-wide text-mute">Open Positions</h2>
        <p className="mt-3 text-[12px] text-purp-soft">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-[28px] p-5">
        <h2 className="text-[14px] font-extrabold uppercase tracking-wide text-mute">Open Positions</h2>
        <p className="mt-3 text-[12px] text-dn">{error}</p>
      </div>
    );
  }

  if (!data || data.pools.length === 0) {
    return (
      <div className="glass rounded-[28px] p-5">
        <h2 className="text-[14px] font-extrabold uppercase tracking-wide text-mute">Open Positions</h2>
        <p className="mt-3 text-[13px] text-mute">No open positions</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="glass rounded-[28px] p-5">
        <h2 className="mb-3 text-[14px] font-extrabold uppercase tracking-wide text-mute">Open Positions</h2>
        <div className="space-y-2">
          {data.pools.slice(0, 3).map((pool) => (
            <PositionCardCompact key={pool.poolAddress} pool={pool} />
          ))}
        </div>
        {data.pools.length > 3 && (
          <p className="mt-2 text-[11px] text-mute">+{data.pools.length - 3} more</p>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-[28px] p-5">
      <h2 className="mb-4 text-[18px] font-extrabold">
        Open Positions ({data.totalPositions})
      </h2>
      <div className="space-y-3">
        {data.pools.map((pool) => (
          <PositionCard key={pool.poolAddress} pool={pool} />
        ))}
      </div>
    </div>
  );
}

function PositionCard({ pool }: { pool: MeteoraOpenPool }) {
  const pnl = num(pool.pnl);
  const pnlPct = num(pool.pnlPctChange);
  const value = num(pool.balances);
  const fees = num(pool.unclaimedFees);
  const pnlColor = pnl >= 0 ? "text-up" : "text-dn";

  return (
    <a
      href={`https://app.meteora.ag/dlmm/${pool.poolAddress}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl border border-white/[.08] bg-gradient-to-br from-white/[.04] to-transparent p-4 transition hover:border-orange/40 hover:bg-white/[.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pool.tokenXIcon} alt={pool.tokenX} className="h-8 w-8 rounded-full border border-base bg-[#222] object-cover" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pool.tokenYIcon} alt={pool.tokenY} className="-ml-2 h-8 w-8 rounded-full border border-base bg-[#222] object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold">{pool.tokenX}/{pool.tokenY}</span>
              <span className="rounded-full bg-orange/20 px-2 py-0.5 text-[10px] font-bold text-orange">
                DLMM {pool.binStep}bp
              </span>
              {pool.outOfRange && (
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                  Out of range
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-mute">
              {pool.openPositionCount} position{pool.openPositionCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
        <div>
          <div className="text-[11px] text-mute">Value</div>
          <div className="num mt-0.5 font-semibold">{fmtUsd(value)}</div>
        </div>
        <div>
          <div className="text-[11px] text-mute">Unrealized PnL</div>
          <div className={`num mt-0.5 font-semibold ${pnlColor}`}>
            {fmtUsd(pnl, { signed: true })} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
          </div>
        </div>
        <div>
          <div className="text-[11px] text-mute">Unclaimed Fees</div>
          <div className="num mt-0.5 font-semibold text-orange">{fmtUsd(fees, { signed: true })}</div>
        </div>
      </div>
    </a>
  );
}

function PositionCardCompact({ pool }: { pool: MeteoraOpenPool }) {
  const pnl = num(pool.pnl);
  const value = num(pool.balances);
  const pnlColor = pnl >= 0 ? "text-up" : "text-dn";

  return (
    <a
      href={`https://app.meteora.ag/dlmm/${pool.poolAddress}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between rounded-xl border border-white/[.08] bg-black/20 p-3 transition hover:border-orange/40"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pool.tokenXIcon} alt={pool.tokenX} className="h-6 w-6 rounded-full border border-base bg-[#222] object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pool.tokenYIcon} alt={pool.tokenY} className="-ml-1.5 h-6 w-6 rounded-full border border-base bg-[#222] object-cover" />
        </div>
        <div>
          <div className="text-[13px] font-semibold">{pool.tokenX}/{pool.tokenY}</div>
          <div className="num text-[11px] text-mute">{fmtUsd(value)}</div>
        </div>
      </div>
      <div className={`num text-[14px] font-bold ${pnlColor}`}>
        {fmtUsd(pnl, { signed: true })}
      </div>
    </a>
  );
}
