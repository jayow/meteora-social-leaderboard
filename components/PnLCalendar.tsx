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
 * Short day value for narrow cells (phones, compact): "$" plus at most four characters, no sign (the
 * cell's green / red tint carries it), rounding more as values grow: $2.97, $10.1, $72, $559, $2.3K,
 * $12K, $100K, $1.2M, $26M. The exact signed value is in the cell's title and in the sm+ layout.
 */
export function formatCell(n: number): string {
  const abs = Math.abs(n);
  const trim = (v: number, digits: number) => String(Number(v.toFixed(digits)));
  let body: string;
  if (abs < 9.995) body = abs.toFixed(2);
  else if (abs < 99.95) body = trim(abs, 1);
  else if (abs < 999.5) body = String(Math.round(abs));
  else if (abs < 9_950) body = `${trim(abs / 1000, 1)}K`;
  else if (abs < 999_500) body = `${Math.round(abs / 1000)}K`;
  else if (abs < 9_950_000) body = `${trim(abs / 1e6, 1)}M`;
  else body = `${Math.round(abs / 1e6)}M`;
  return `$${body}`;
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

  if (empty) return <p className="text-base text-mute" data-testid="pnl-calendar-empty">No closed positions in the last {LOOKBACK_MONTHS} months.</p>;
  // Loading: the month header and a faint 7-column grid, not one big block.
  if (!cursor)
    return (
      <div aria-busy="true" aria-label="Loading calendar">
        <span className="skeleton mx-auto block h-5 w-32" />
        <div className={`mt-4 grid grid-cols-7 gap-1 ${compact ? "" : "sm:gap-1.5"}`}>
          {Array.from({ length: 35 }, (_, i) => (
            <span key={i} className={`skeleton block rounded-tile ${compact ? "h-[46px]" : "h-[60px] sm:h-[76px]"}`} />
          ))}
        </div>
      </div>
    );

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

  const phone = (
    <>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <button type="button" aria-label="Previous month" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-base text-fg-secondary transition hover:bg-border hover:text-fg" onClick={() => setCursor(new Date(y, m - 1, 1))}>
              ‹
            </button>
            <div className={`text-center font-semibold tracking-[-0.01em] text-fg ${compact ? "min-w-28 text-base" : "min-w-[8.5rem] text-md sm:min-w-40"}`}>{title}</div>
            <button type="button" aria-label="Next month" disabled={isCurrent} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-base text-fg-secondary transition hover:bg-border hover:text-fg disabled:opacity-30" onClick={() => setCursor(new Date(y, m + 1, 1))}>
              ›
            </button>
          </div>
          <div className="shrink-0 whitespace-nowrap text-base">
            <span className={`font-semibold tabular-nums ${total > 0 ? "text-up" : total < 0 ? "text-dn" : "text-fg"}`}>{signed(total)}</span>
            <span className="ml-1 text-mute">{isCurrent ? "this month" : "in " + cursor.toLocaleString("en-US", { month: "short" })}</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-mute">
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
              <div key={iso} className={`${cellH} flex flex-col items-center gap-1 rounded-tile border px-0.5 pb-1 pt-1.5 text-center sm:px-1 ${tone}`} title={e ? `${iso}: ${formatUsd(pnl, true)} · ${pos} closed` : iso}>
                <div className="text-xs font-medium leading-none tabular-nums text-mute">{day}</div>
                {e && pnl !== 0 ? (
                  <>
                    {compact ? (
                      <div className="max-w-full truncate text-xs font-semibold leading-tight tracking-[-0.02em] tabular-nums">{formatCell(pnl)}</div>
                    ) : (
                      <>
                        <div className="max-w-full truncate text-xs font-semibold leading-tight tracking-[-0.02em] tabular-nums sm:hidden">{formatCell(pnl)}</div>
                        <div className="hidden max-w-full truncate text-base font-semibold leading-tight tracking-[-0.01em] tabular-nums sm:block">{signed(pnl)}</div>
                        <div className="hidden text-xs leading-none tabular-nums text-mute sm:block">{pos} pos</div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-xs leading-none text-border-strong" aria-hidden>
                    ·
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {error && <p className="mt-2 text-xs text-dn">{error}</p>}
    </>
  );

  // `compact` keeps the phone layout at every width.
  if (compact) return <div className="font-numeric">{phone}</div>;

  return (
    <div className="font-numeric">
      <div data-layout="phone" className="md:hidden">
        {phone}
      </div>
      <DesktopMonth
        year={y}
        month={m}
        cells={cells}
        map={map}
        total={total}
        isCurrent={isCurrent}
        loading={loading}
        error={error}
        onPrev={() => setCursor(new Date(y, m - 1, 1))}
        onNext={() => setCursor(new Date(y, m + 1, 1))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* md and up: borderless heatmap grid, value-first cells, hover detail */
/* ------------------------------------------------------------------ */

const DOW_MD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Flat fill steps by |PnL| relative to the month's biggest day (literal classes for Tailwind). */
const UP_FILL = ["bg-up/[0.08]", "bg-up/[0.14]", "bg-up/[0.20]", "bg-up/[0.28]"];
const DN_FILL = ["bg-dn/[0.08]", "bg-dn/[0.14]", "bg-dn/[0.20]", "bg-dn/[0.28]"];
const fillStep = (ratio: number) => (ratio < 0.12 ? 0 : ratio < 0.35 ? 1 : ratio < 0.65 ? 2 : 3);

const usdFull = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Exact value for the tooltip: "+$1,234.56" / "\u2212$93.95". */
const signedFull = (n: number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${usdFull.format(Math.abs(n))}`;
/** Narrow desktop cells (~1024px two-column profile): signed, cents only under $10. */
const signedShort = (n: number) => `${n > 0 ? "+" : ""}${formatCell(n)}`;

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={dir === "left" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DesktopMonth({
  year,
  month,
  cells,
  map,
  total,
  isCurrent,
  loading,
  error,
  onPrev,
  onNext,
}: {
  year: number;
  month: number;
  cells: (number | null)[];
  map: Map<string, DailyPnL>;
  total: number;
  isCurrent: boolean;
  loading: boolean;
  error: string | null;
  onPrev: () => void;
  onNext: () => void;
}) {
  const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "long" });
  const now = new Date();
  const todayDay = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : null;
  const iso = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Month stats from this month's days only.
  const monthDays = cells.filter((d): d is number => d !== null).map((d) => map.get(iso(d))).filter((e): e is DailyPnL => !!e);
  const maxAbs = monthDays.reduce((a, e) => Math.max(a, Math.abs(e.pnl)), 0);
  const greenDays = monthDays.filter((e) => e.pnl > 0).length;
  const redDays = monthDays.filter((e) => e.pnl < 0).length;
  const best = monthDays.reduce<DailyPnL | null>((b, e) => (e.pnl > 0 && (!b || e.pnl > b.pnl) ? e : b), null);
  const bestLabel = best ? new Date(`${best.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

  const ghost =
    "flex h-7 w-7 items-center justify-center rounded-tag text-mute transition hover:bg-surface-raised hover:text-fg disabled:pointer-events-none disabled:opacity-30";

  return (
    <div data-layout="desktop" className="hidden md:block">
      <div className="mb-5 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-md font-semibold tracking-[-0.01em] text-fg">
              {monthName} {year}
            </h3>
            <div className="flex items-center">
              <button type="button" aria-label="Previous month" className={ghost} onClick={onPrev}>
                <Chevron dir="left" />
              </button>
              <button type="button" aria-label="Next month" className={ghost} disabled={isCurrent} onClick={onNext}>
                <Chevron dir="right" />
              </button>
            </div>
          </div>
          {!monthDays.some((e) => e.pnl !== 0) ? (
            <div className="mt-1.5 text-sm text-mute" data-testid="pnl-summary-empty">
              No closed-position PnL {isCurrent ? "yet this month" : `in ${monthName}`}
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-mute" data-testid="pnl-summary">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
                <span className="tabular-nums text-fg-secondary">{greenDays}</span> green {greenDays === 1 ? "day" : "days"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-dn" aria-hidden />
                <span className="tabular-nums text-fg-secondary">{redDays}</span> red {redDays === 1 ? "day" : "days"}
              </span>
              {best && (
                <span>
                  Best <span className="font-medium tabular-nums text-up">{signed(best.pnl)}</span> on {bestLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-lg font-semibold leading-none tabular-nums ${total > 0 ? "text-up" : total < 0 ? "text-dn" : "text-mute"}`} data-testid="pnl-month-total">
            {signed(total)}
          </div>
          <div className="mt-1.5 text-sm text-mute">{monthName} PnL</div>
        </div>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-[5px]">
        {DOW_MD.map((d) => (
          <div key={d} className="px-2 text-xs font-medium text-mute lg:px-2.5">
            {d}
          </div>
        ))}
      </div>

      <div className={`grid grid-cols-7 gap-[5px] transition-opacity ${loading ? "opacity-50" : ""}`}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} aria-hidden />;
          const key = iso(day);
          const e = map.get(key);
          const pnl = e?.pnl ?? 0;
          const pos = e?.positions ?? 0;
          const hasDay = !!e && (pnl !== 0 || pos > 0);
          const step = maxAbs > 0 ? fillStep(Math.abs(pnl) / maxAbs) : 0;
          const fill = pnl > 0 ? UP_FILL[step] : pnl < 0 ? DN_FILL[step] : hasDay ? "bg-surface-raised" : "bg-surface-raised/25";
          const isToday = day === todayDay;
          const col = i % 7;
          const tipPos = col <= 1 ? "left-0" : col >= 5 ? "right-0" : "left-1/2 -translate-x-1/2";
          const dateLong = new Date(year, month, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          return (
            <div
              key={key}
              data-testid="pnl-day"
              data-pnl={pnl}
              data-step={pnl !== 0 ? step : undefined}
              tabIndex={hasDay ? 0 : undefined}
              aria-label={hasDay ? `${dateLong}: ${signedFull(pnl)}, ${pos} ${pos === 1 ? "position" : "positions"} closed` : undefined}
              className={`group @container relative flex aspect-[5/4] flex-col justify-between rounded-tile p-2 outline-none lg:p-2.5 ${fill} ${
                isToday ? "ring-1 ring-inset ring-border-strong" : ""
              } ${hasDay ? "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent" : ""}`}
            >
              <span className={`text-xs font-medium leading-none tabular-nums ${isToday ? "text-fg" : "text-mute"}`}>{day}</span>
              {hasDay && (
                <span className={`block truncate text-md font-semibold leading-none tracking-[-0.02em] tabular-nums ${pnl > 0 ? "text-up" : pnl < 0 ? "text-dn" : "text-mute"}`}>
                  <span className="@min-[62px]:hidden">{signedShort(pnl)}</span>
                  <span className="hidden @min-[62px]:inline">{signed(pnl)}</span>
                </span>
              )}
              {hasDay && (
                <div
                  aria-hidden
                  data-testid="pnl-tip"
                  className={`pointer-events-none absolute bottom-full z-20 mb-1.5 hidden w-max rounded-tag border border-border-strong bg-surface-raised px-3 py-2 text-left group-hover:block group-focus-visible:block ${tipPos}`}
                >
                  <div className="text-xs text-mute">{dateLong}</div>
                  <div className={`mt-1 text-base font-semibold leading-none tabular-nums ${pnl > 0 ? "text-up" : pnl < 0 ? "text-dn" : "text-fg"}`}>{signedFull(pnl)}</div>
                  <div className="mt-1.5 text-xs tabular-nums text-fg-secondary">
                    {pos} {pos === 1 ? "position" : "positions"} closed
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-3 text-xs text-dn">{error}</p>}
    </div>
  );
}
