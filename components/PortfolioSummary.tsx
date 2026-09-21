"use client";

import { useEffect, useState } from "react";
import type { Trader } from "@/lib/types";
import { formatUsd } from "@/lib/pnl";
import { num } from "@/lib/meteora";

interface LiveStats {
  totalValue: number;
  totalPnl: number;
  pnlPct: number;
  unclaimedFees: number;
  openPositions: number;
  closedPositions: number;
}

export function PortfolioSummary({ trader }: { trader: Trader }) {
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trader.walletAddress) {
      setLiveStats(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [totalRes, openRes] = await Promise.all([
          fetch(`/api/meteora/total?wallet=${trader.walletAddress}`),
          fetch(`/api/meteora/open?wallet=${trader.walletAddress}`),
        ]);
        if (!totalRes.ok || !openRes.ok) {
          throw new Error("Meteora API request failed");
        }
        const totalData = await totalRes.json();
        const openData = await openRes.json();
        const totals = openData.total || {};

        const live: LiveStats = {
          // Open portfolio live value / pnl when available; fall back to closed-total PnL
          totalValue: num(totals.balances),
          totalPnl: num(totals.pnl) || num(totalData.totalPnlUsd),
          pnlPct: num(totals.pnlPctChange) || num(totalData.totalPnlPctChange),
          unclaimedFees: num(totals.unclaimedFees),
          openPositions: num(openData.totalPositions) || (Array.isArray(openData.pools) ? openData.pools.reduce((a: number, p: { openPositionCount?: number }) => a + (p.openPositionCount || 0), 0) : 0),
          closedPositions: num(totalData.totalClosedPositions),
        };
        if (!cancelled) setLiveStats(live);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Could not load Meteora portfolio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [trader.walletAddress]);

  const stats = liveStats || {
    totalValue: trader.portfolioValue,
    totalPnl: trader.totalPnL,
    pnlPct: 0,
    unclaimedFees: 0,
    openPositions: 0,
    closedPositions: 0,
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      {loading && <div className="mb-3 text-xs text-violet-400">Loading live Meteora DLMM data…</div>}
      {trader.walletAddress && !loading && !error && (
        <div className="mb-3 text-xs text-green-400">✓ Live Meteora DLMM data</div>
      )}
      {error && <div className="mb-3 text-xs text-red-400">{error}</div>}
      {!trader.walletAddress && (
        <div className="mb-3 text-xs text-zinc-500">Connect wallet for live data</div>
      )}

      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {liveStats ? "Open Position Value" : "Total Portfolio Value"}
      </div>
      <div className="mt-1 text-3xl font-semibold">{formatUsd(stats.totalValue)}</div>

      <div className="mt-6 text-xs uppercase tracking-wide text-zinc-500">
        {liveStats ? "Live / Lifetime PnL" : "Total PnL"}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${stats.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
        {formatUsd(stats.totalPnl, true)}{" "}
        {liveStats && (
          <span className="text-base opacity-80">
            ({stats.pnlPct >= 0 ? "+" : ""}
            {stats.pnlPct.toFixed(2)}%)
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        {liveStats ? (
          <>
            <Stat label="Open Positions" value={`${stats.openPositions}`} />
            <Stat label="Closed Positions" value={`${stats.closedPositions}`} />
            <Stat label="Unclaimed Fees" value={formatUsd(stats.unclaimedFees, true)} good />
            <Stat label="Wallet" value={`${(trader.walletAddress || "").slice(0, 4)}…${(trader.walletAddress || "").slice(-4)}`} />
          </>
        ) : (
          <>
            <Stat label="Win Rate" value={`${trader.winRate.toFixed(2)}%`} />
            <Stat label="Avg Win" value={formatUsd(trader.avgWin, true)} good />
            <Stat label="Biggest Win" value={formatUsd(trader.biggestWin, true)} good />
            <Stat label="Avg Loss" value={formatUsd(trader.avgLoss, true)} bad />
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  const c = good ? "text-green-400" : bad ? "text-red-400" : "text-white";
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 font-medium ${c}`}>{value}</div>
    </div>
  );
}
