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
/**
 * Short day value for narrow cells (phones, compact): no "+" (the tint and the "-" on losses carry the
 * sign), cents only under $10. The full value is in the cell's title and in the sm+ layout.
 */
function formatCell(n: number): string {
  const abs = Math.abs(n);
  const body = abs >= 1000 ? `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K` : `$${abs.toFixed(abs >= 10 ? 0 : 2)}`;
  return `${n < 0 ? "\u2212" : ""}${body}`;
}
/** formatUsd with a true minus sign: same width as "+" in tabular figures (a hyphen is narrower). */
const signed = (n: number) => formatUsd(n, true).replace("-", "\u2212");

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
  const cellH = compact ? "min-h-[46px]" : "min-h-[60px] sm:min-h-[76px]";

  return (
    <div className="font-numeric">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" aria-label="Previous month" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[14px] text-fg-secondary hover:bg-border hover:text-fg" onClick={() => setCursor(new Date(y, m - 1, 1))}>
            ‹
          </button>
          <div className={`text-center font-semibold tracking-[-0.01em] text-fg ${compact ? "min-w-28 text-[14px]" : "min-w-[8.5rem] text-[15px] sm:min-w-40 sm:text-[16px]"}`}>{title}</div>
          <button type="button" aria-label="Next month" disabled={isCurrent} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[14px] text-fg-secondary hover:bg-border hover:text-fg disabled:opacity-30" onClick={() => setCursor(new Date(y, m + 1, 1))}>
            ›
          </button>
        </div>
        <div className="shrink-0 whitespace-nowrap text-[13px]">
          <span className={`font-semibold tabular-nums ${total > 0 ? "text-up" : total < 0 ? "text-dn" : "text-fg"}`}>{signed(total)}</span>
          <span className="ml-1 text-mute">{isCurrent ? "this month" : "in " + cursor.toLocaleString("en-US", { month: "short" })}</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-[0.06em] text-mute">
        {(compact ? DOW : DOW_LONG).map((d, i) => (
          <div key={i} className="py-1.5">
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
              ? "bg-up/10 border-up/25 text-up"
              : pnl < 0
                ? "bg-dn/10 border-dn/25 text-dn"
                : "bg-surface-raised border-border text-mute";
          return (
            <div key={iso} className={`${cellH} flex flex-col items-center gap-1 rounded-xl border px-0.5 pb-1 pt-1.5 text-center sm:px-1 ${tone}`} title={e ? `${iso}: ${formatUsd(pnl, true)} · ${pos} closed` : iso}>
              <div className="text-[10px] font-medium leading-none tabular-nums text-mute">{day}</div>
              {e && pnl !== 0 ? (
                <>
                  {compact ? (
                    <div className="max-w-full truncate text-[10px] font-semibold leading-tight tabular-nums">{formatCell(pnl)}</div>
                  ) : (
                    <>
                      <div className="max-w-full truncate text-[11px] font-semibold leading-tight tracking-[-0.02em] tabular-nums sm:hidden">{formatCell(pnl)}</div>
                      <div className="hidden max-w-full truncate text-[13px] font-semibold leading-tight tracking-[-0.01em] tabular-nums sm:block">{signed(pnl)}</div>
                      <div className="hidden text-[10px] leading-none tabular-nums text-mute sm:block">{pos} pos</div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-[10px] leading-none text-border-strong" aria-hidden>
                  ·
                </div>
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
