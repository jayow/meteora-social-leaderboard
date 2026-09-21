import type { Trader } from "@/lib/types";
import { formatUsd } from "@/lib/pnl";

export function PortfolioSummary({ trader }: { trader: Trader }) {
  const base = trader.portfolioValue - trader.totalPnL;
  const pct = base ? (trader.totalPnL / Math.abs(base)) * 100 : 0;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">Total Portfolio Value</div>
      <div className="mt-1 text-3xl font-semibold">{formatUsd(trader.portfolioValue)}</div>
      <div className="mt-6 text-xs uppercase tracking-wide text-zinc-500">Total PnL</div>
      <div className={`mt-1 text-2xl font-semibold ${trader.totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
        {formatUsd(trader.totalPnL, true)}{" "}
        <span className="text-base opacity-80">({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)</span>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <Stat label="Win Rate" value={`${trader.winRate.toFixed(2)}%`} />
        <Stat label="Avg Win" value={formatUsd(trader.avgWin, true)} good />
        <Stat label="Biggest Win" value={formatUsd(trader.biggestWin, true)} good />
        <Stat label="Avg Loss" value={formatUsd(trader.avgLoss, true)} bad />
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
