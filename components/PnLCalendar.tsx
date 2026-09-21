"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyPnL } from "@/lib/types";
import { formatUsd, monthTotal } from "@/lib/pnl";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PnLCalendar({ history, walletAddress }: { history: DailyPnL[]; walletAddress?: string }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [liveHistory, setLiveHistory] = useState<DailyPnL[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!walletAddress) {
      setLiveHistory([]);
      return;
    }

    const fetchLiveHistory = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/meteora/portfolio?wallet=${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          if (data.events && Array.isArray(data.events)) {
            const dayMap = new Map<string, { pnl: number; positions: number }>();
            
            data.events.forEach((event: { timestamp: number; pnl?: number; amount?: number }) => {
              const date = new Date(event.timestamp * 1000).toISOString().split("T")[0];
              const pnl = event.pnl || event.amount || 0;
              const existing = dayMap.get(date) || { pnl: 0, positions: 0 };
              dayMap.set(date, {
                pnl: existing.pnl + pnl,
                positions: existing.positions + 1,
              });
            });

            const liveDays: DailyPnL[] = Array.from(dayMap.entries()).map(([date, { pnl, positions }]) => ({
              date,
              pnl,
              positions,
            }));
            setLiveHistory(liveDays);
          }
        }
      } catch (err) {
        console.error("Error fetching live history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLiveHistory();
  }, [walletAddress]);

  const activeHistory = walletAddress && liveHistory.length > 0 ? liveHistory : history;
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const map = useMemo(() => new Map(activeHistory.map((d) => [d.date, d])), [activeHistory]);
  const total = monthTotal(activeHistory, y, m);
  const start = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(start).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const title = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      {loading && (
        <div className="mb-3 text-xs text-violet-400">Loading live PnL calendar from Meteora...</div>
      )}
      {walletAddress && !loading && liveHistory.length > 0 && (
        <div className="mb-3 text-xs text-green-400">✓ PnL from Meteora events (deposits, withdrawals, claims, closes)</div>
      )}
      {!walletAddress && (
        <div className="mb-3 text-xs text-zinc-500">Connect wallet for live PnL tracking</div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-zinc-700 px-2 py-1 text-sm" onClick={() => setCursor(new Date(y, m - 1, 1))}>‹</button>
          <div className="min-w-40 text-center text-sm font-semibold">{title}</div>
          <button type="button" className="rounded border border-zinc-700 px-2 py-1 text-sm" onClick={() => setCursor(new Date(y, m + 1, 1))}>›</button>
          <button type="button" className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-400" onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))}>Today</button>
        </div>
        <div className="text-sm">
          Monthly PnL:{" "}
          <span className={total >= 0 ? "text-green-400" : "text-red-400"}>{formatUsd(total, true)}</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-zinc-500">
        {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} className="min-h-[72px]" />;
          const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const e = map.get(iso);
          const pnl = e?.pnl ?? 0;
          const pos = e?.positions ?? 0;
          const tone = pnl > 0 ? "bg-green-500/10 text-green-400 border-green-500/20" : pnl < 0 ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-zinc-900/50 text-zinc-500 border-zinc-800";
          return (
            <div key={iso} className={`min-h-[72px] rounded-md border p-1.5 ${tone}`}>
              <div className="text-[10px] text-zinc-500">{day}</div>
              <div className="mt-1 text-xs font-semibold">{formatUsd(pnl, true)}</div>
              <div className="mt-0.5 text-[10px] opacity-70">{pos ? `${pos} Positions` : "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
