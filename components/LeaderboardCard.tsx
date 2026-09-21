import Link from "next/link";
import type { Trader } from "@/lib/types";
import { formatUsd } from "@/lib/pnl";

export function LeaderboardCard({ trader, rank }: { trader: Trader; rank: number }) {
  return (
    <Link href={`/profile/${trader.id}`} className="block rounded-xl border border-zinc-800 bg-zinc-950 p-4 transition hover:border-violet-500/40 hover:bg-zinc-900/70">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-zinc-400">#{rank}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={trader.xAvatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${trader.username}`} alt="" className="h-12 w-12 rounded-full border border-zinc-700" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{trader.displayName}</h3>
            {trader.xHandle && <span className="text-xs text-sky-400">@{trader.xHandle}</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{trader.thesis}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span className={trader.totalPnL >= 0 ? "text-green-400" : "text-red-400"}>PnL {formatUsd(trader.totalPnL, true)}</span>
            <span className="text-zinc-400">Win {trader.winRate.toFixed(1)}%</span>
            <span className="text-zinc-500">{formatUsd(trader.portfolioValue)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
