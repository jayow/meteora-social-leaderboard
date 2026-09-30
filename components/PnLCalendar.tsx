"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyPnL } from "@/lib/types";
import { formatUsd, monthTotal } from "@/lib/pnl";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const DOW_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PnLCalendar({ walletAddress, compact = false }: { walletAddress?: string | null; compact?: boolean }) {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [days, setDays] = useState<DailyPnL[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) {
      setDays([]);
      return;
    }
    let cancelled = false;
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const month = `${y}-${String(m + 1).padStart(2, "0")}`;
    setLoading(true);
    setError(null);
    fetch(`/api/meteora/calendar?wallet=${walletAddress}&month=${month}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("calendar fetch failed");
        const data = (await res.json()) as { days?: DailyPnL[] };
        if (!cancelled) setDays(Array.isArray(data.days) ? data.days : []);
      })
      .catch(() => {
        if (!cancelled) {
          setDays([]);
          setError("Couldn't load the Meteora calendar");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, cursor]);

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const map = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const total = monthTotal(days, y, m);
  const start = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(start).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const title = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });
  const isCurrent = y === now.getFullYear() && m === now.getMonth();
  const cellH = compact ? "min-h-[46px]" : "min-h-[64px] sm:min-h-[76px]";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous month" className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[.06] text-[14px] hover:bg-white/[.1]" onClick={() => setCursor(new Date(y, m - 1, 1))}>
            ‹
          </button>
          <div className={`text-center font-bold ${compact ? "min-w-32 text-[14px]" : "min-w-40 text-[16px]"}`}>{title}</div>
          <button type="button" aria-label="Next month" disabled={isCurrent} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[.06] text-[14px] hover:bg-white/[.1] disabled:opacity-30" onClick={() => setCursor(new Date(y, m + 1, 1))}>
            ›
          </button>
        </div>
        <div className="text-[13px] font-semibold">
          <span className={`num ${total > 0 ? "text-up" : total < 0 ? "text-dn" : "text-white"}`}>{formatUsd(total, true)}</span>
          <span className="ml-1 font-medium text-mute">this month</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-mute">
        {(compact ? DOW : DOW_LONG).map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className={`grid grid-cols-7 gap-1 ${loading ? "opacity-50" : ""}`}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} className={cellH} />;
          const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const e = map.get(iso);
          const pnl = e?.pnl ?? 0;
          const pos = e?.positions ?? 0;
          const tone =
            pnl > 0
              ? "bg-up/15 border-up/30 text-up"
              : pnl < 0
                ? "bg-dn/15 border-dn/30 text-dn"
                : "bg-white/[.025] border-white/[.05] text-mute";
          return (
            <div key={iso} className={`${cellH} rounded-xl border p-1 text-center ${tone}`} title={e ? `${iso}: ${formatUsd(pnl, true)} · ${pos} closed` : iso}>
              <div className="text-[9px] font-medium text-white/50">{day}</div>
              {e && pnl !== 0 ? (
                <>
                  <div className={`num font-bold leading-tight ${compact ? "text-[10px]" : "text-[11px] sm:text-[13px]"}`}>{formatUsd(pnl, true)}</div>
                  {!compact && <div className="hidden text-[9px] opacity-70 sm:block">{pos} pos</div>}
                </>
              ) : (
                <div className="text-[10px] opacity-40">·</div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-[11px] text-dn">{error}</p>}
      {!compact && !error && <p className="mt-2 text-[11px] text-mute">Daily closed-position PnL · live from Meteora&apos;s portfolio calendar</p>}
    </div>
  );
}
