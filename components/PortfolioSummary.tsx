"use client";

import { useEffect, useState } from "react";
import type { Trader } from "@/lib/types";
import { formatUsd } from "@/lib/pnl";

interface LiveStats {
  totalValue?: number;
  totalPnl?: number;
  totalFees?: number;
  totalDeposits?: number;
  openPositions?: number;
}

export function PortfolioSummary({ trader }: { trader: Trader }) {
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!trader.walletAddress) {
      setLiveStats(null);
      return;
    }

    const fetchLiveData = async () => {
      setLoading(true);
      try {
        const [totalRes, openRes] = await Promise.all([
          fetch(`/api/meteora/total?wallet=${trader.walletAddress}`),
          fetch(`/api/meteora/open?wallet=${trader.walletAddress}`),
        ]);

        if (totalRes.ok && openRes.ok) {
          const totalData = await totalRes.json();
          const openData = await openRes.json();

          setLiveStats({
            totalValue: totalData.totalValue || totalData.total_value || 0,
            totalPnl: totalData.totalPnl || totalData.total_pnl || 0,
            totalFees: totalData.totalFees || totalData.total_fees || 0,
            totalDeposits: totalData.totalDeposits || totalData.total_deposits || 0,
            openPositions: Array.isArray(openData) ? openData.length : (openData.positions?.length || 0),
          });
        }
      } catch (err) {
        console.error("Error fetching live Meteora data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveData();
  }, [trader.walletAddress]);

  const stats = liveStats || {
    totalValue: trader.portfolioValue,
    totalPnl: trader.totalPnL,
  };

  const base = (stats.totalValue || 0) - (stats.totalPnl || 0);
  const pct = base ? ((stats.totalPnl || 0) / Math.abs(base)) * 100 : 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      {loading && (
        <div className="mb-3 text-xs text-violet-400">Loading live data from Meteora...</div>
      )}
      {trader.walletAddress && !loading && (
        <div className="mb-3 text-xs text-green-400">✓ Live Meteora DLMM data</div>
      )}
      {!trader.walletAddress && (
        <div className="mb-3 text-xs text-zinc-500">Connect wallet for live data</div>
      )}
      <div className="text-xs uppercase tracking-wide text-zinc-500">Total Portfolio Value</div>
      <div className="mt-1 text-3xl font-semibold">{formatUsd(stats.totalValue || 0)}</div>
      <div className="mt-6 text-xs uppercase tracking-wide text-zinc-500">Total PnL</div>
      <div className={`mt-1 text-2xl font-semibold ${(stats.totalPnl || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
        {formatUsd(stats.totalPnl || 0, true)}{" "}
        <span className="text-base opacity-80">({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        {liveStats ? (
          <>
            <Stat label="Open Positions" value={`${liveStats.openPositions || 0}`} />
            <Stat label="Total Fees" value={formatUsd(liveStats.totalFees || 0, true)} good />
            <Stat label="Total Deposits" value={formatUsd(liveStats.totalDeposits || 0)} />
            <Stat label="Total Value" value={formatUsd(liveStats.totalValue || 0)} />
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
