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
  totalDeposits: number;
  totalWithdrawals: number;
  totalFees: number;
  avgInvestedUsd?: number;
  winRateUsd?: number;
  biggestPnlUsd?: number;
  biggestPnlPctChange?: number;
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
        const [totalRes, openRes, portfolioRes, performanceRes] = await Promise.all([
          fetch(`/api/meteora/total?wallet=${trader.walletAddress}`),
          fetch(`/api/meteora/open?wallet=${trader.walletAddress}`),
          fetch(`/api/meteora/portfolio?wallet=${trader.walletAddress}`),
          fetch(`/api/meteora/performance?wallet=${trader.walletAddress}&time_range=30d`),
        ]);
        if (!totalRes.ok || !openRes.ok || !portfolioRes.ok) {
          throw new Error("Meteora API request failed");
        }
        const totalData = await totalRes.json();
        const openData = await openRes.json();
        const portfolioData = await portfolioRes.json();
        const performanceData = performanceRes.ok ? await performanceRes.json() : null;
        const totals = openData.total || {};
        const pools = Array.isArray(portfolioData.pools) ? portfolioData.pools : [];

        let totalDeposits = 0;
        let totalWithdrawals = 0;
        let totalFees = 0;
        for (const pool of pools) {
          totalDeposits += num(pool.totalDeposit);
          totalWithdrawals += num(pool.totalWithdrawal);
          totalFees += num(pool.totalFee);
        }

        const live: LiveStats = {
          totalValue: num(totals.balances) + num(totals.unclaimedFees),
          totalPnl: num(totalData.totalPnlUsd),
          pnlPct: num(totalData.totalPnlPctChange),
          unclaimedFees: num(totals.unclaimedFees),
          openPositions: num(openData.totalPositions) || (Array.isArray(openData.pools) ? openData.pools.reduce((a: number, p: { openPositionCount?: number }) => a + (p.openPositionCount || 0), 0) : 0),
          closedPositions: num(totalData.totalClosedPositions),
          totalDeposits,
          totalWithdrawals,
          totalFees,
          avgInvestedUsd: performanceData ? num(performanceData.avg_invested_usd) : undefined,
          winRateUsd: performanceData ? num(performanceData.win_rate_usd) : undefined,
          biggestPnlUsd: performanceData ? num(performanceData.biggest_pnl_usd) : undefined,
          biggestPnlPctChange: performanceData ? num(performanceData.biggest_pnl_pct_change) : undefined,
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
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalFees: 0,
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
        {liveStats ? "Total Portfolio Value" : "Total Portfolio Value"}
      </div>
      <div className="mt-1 text-3xl font-semibold">
        {formatUsd(stats.totalValue)}
      </div>

      <div className="mt-6 text-xs uppercase tracking-wide text-zinc-500">
        Total PnL
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
            <Stat label="Total Deposits" value={formatUsd(stats.totalDeposits)} />
            <Stat label="Total Withdrawals" value={formatUsd(stats.totalWithdrawals)} />
            <Stat label="Fees Claimed" value={formatUsd(stats.totalFees, true)} good />
            {stats.avgInvestedUsd !== undefined && (
              <Stat label="Avg Invested (30D)" value={formatUsd(stats.avgInvestedUsd)} />
            )}
            {stats.winRateUsd !== undefined && (
              <Stat label="Win Rate (30D)" value={`${stats.winRateUsd.toFixed(2)}%`} good={stats.winRateUsd >= 50} />
            )}
            {stats.biggestPnlUsd !== undefined && (
              <Stat 
                label="Biggest Win (30D)" 
                value={`${formatUsd(stats.biggestPnlUsd, true)}${stats.biggestPnlPctChange ? ` (+${stats.biggestPnlPctChange.toFixed(2)}%)` : ''}`}
                good 
              />
            )}
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
