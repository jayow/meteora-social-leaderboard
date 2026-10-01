"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyPnL } from "@/lib/types";
import { formatUsd, monthTotal } from "@/lib/pnl";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const DOW_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** How far back to look for the most recent month with closed-position PnL. */
const LOOKBACK_MONTHS = 12;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
/** Meteora zero-fills every day, so "has data" means any non-zero PnL or a closed position. */
const hasData = (days: DailyPnL[]) => days.some((d) => d.pnl !== 0 || d.positions > 0);

async function fetchMonth(userId: number, month: string): Promise<DailyPnL[]> {
  const res = await fetch(`/api/users/${userId}/calendar?month=${month}`);
  if (!res.ok) throw new Error("calendar fetch failed");
  const data = (await res.json()) as { days?: DailyPnL[] };
  return Array.isArray(data.days) ? data.days : [];
}

export function PnLCalendar({ userId, compact = false }: { userId?: number | null; compact?: boolean }) {
  // null until we know which month to open on.
  const [cursor, setCursor] = useState<Date | null>(null);
  const [days, setDays] = useState<DailyPnL[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const cache = useRef(new Map<string, DailyPnL[]>());

  // Open on the current month if it has data, else the most recent month that does (within the lookback).
  useEffect(() => {
    cache.current = new Map();
    setCursor(null);
    setDays([]);
    setError(null);
    setEmpty(false);
    if (!userId) {
      setEmpty(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const now = new Date();
      for (let i = 0; i < LOOKBACK_MONTHS; i++) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        let list: DailyPnL[];
        try {
          list = await fetchMonth(userId, monthKey(month));
        } catch {
          // Fall back to the current month; the month loader below shows the error state.
          if (!cancelled) setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
          return;
        }
        if (cancelled) return;
        cache.current.set(monthKey(month), list);
        if (hasData(list)) {
          setCursor(month);
          return;
        }
      }
      if (!cancelled) setEmpty(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Load the month being viewed (cached months, including the probed ones, render instantly).
  useEffect(() => {
    if (!userId || !cursor) return;
    const key = monthKey(cursor);
    const hit = cache.current.get(key);
    setError(null);
    if (hit) {
      setDays(hit);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMonth(userId, key)
      .then((list) => {
        if (cancelled) return;
        cache.current.set(key, list);
        setDays(list);
      })
      .catch(() => {
        if (cancelled) return;
        setDays([]);
        setError("Couldn't load the Meteora calendar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, cursor]);

  const map = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  if (empty) return <p className="text-[13px] text-mute" data-testid="pnl-calendar-empty">No closed positions in the last {LOOKBACK_MONTHS} months.</p>;
  if (!cursor) return <div className={`animate-pulse rounded-xl bg-surface-raised ${compact ? "h-[330px]" : "h-[420px] sm:h-[500px]"}`} />;

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const now = new Date();
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
          <button type="button" aria-label="Previous month" className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-[14px] hover:bg-border" onClick={() => setCursor(new Date(y, m - 1, 1))}>
            ‹
          </button>
          <div className={`text-center font-bold ${compact ? "min-w-32 text-[14px]" : "min-w-40 text-[16px]"}`}>{title}</div>
          <button type="button" aria-label="Next month" disabled={isCurrent} className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-[14px] hover:bg-border disabled:opacity-30" onClick={() => setCursor(new Date(y, m + 1, 1))}>
            ›
          </button>
        </div>
        <div className="text-[13px] font-semibold">
          <span className={`num ${total > 0 ? "text-up" : total < 0 ? "text-dn" : "text-fg"}`}>{formatUsd(total, true)}</span>
          <span className="ml-1 font-medium text-mute">{isCurrent ? "this month" : "in " + cursor.toLocaleString("en-US", { month: "short" })}</span>
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
                : "bg-surface-raised border-border text-mute";
          return (
            <div key={iso} className={`${cellH} rounded-xl border p-1 text-center ${tone}`} title={e ? `${iso}: ${formatUsd(pnl, true)} · ${pos} closed` : iso}>
              <div className="text-[9px] font-medium text-mute">{day}</div>
              {e && pnl !== 0 ? (
                <>
                  <div className={`num font-bold leading-tight ${compact ? "text-[10px]" : "text-[11px] sm:text-[13px]"}`}>{formatUsd(pnl, true)}</div>
                  {!compact && <div className="hidden text-[9px] sm:block">{pos} pos</div>}
                </>
              ) : (
                <div className="text-[10px] text-border-strong" aria-hidden>·</div>
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
