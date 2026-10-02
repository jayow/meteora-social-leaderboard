"use client";

/**
 * Leaderboard heading variants (round 3 exploration, picked via ?hv=a|a-plain|b|c on the board).
 * - A: the headline is the control. A sentence whose metric and range words open small menus.
 * - B: a small "Top LPs by" with the metrics as large inline words, range and filters on one baseline.
 * - C: playful sentence with the metric menu; range as quiet text toggles on the status line.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { timeAgo } from "@/lib/format";

export type HeadingVariant = "a" | "a-plain" | "b" | "c";
export const HEADING_VARIANTS: readonly HeadingVariant[] = ["a", "a-plain", "b", "c"];
export const isHeadingVariant = (v: string | null): v is HeadingVariant => v !== null && (HEADING_VARIANTS as readonly string[]).includes(v);

export type BoardRange = "7d" | "30d" | "all";
export type BoardMetric = "pnl" | "fees" | "volume" | "winrate";
export type BoardView = "members" | "countries";

export interface MenuOption<T extends string> {
  value: T;
  label: string;
}

export const METRIC_OPTIONS: MenuOption<BoardMetric>[] = [
  { value: "pnl", label: "PnL" },
  { value: "fees", label: "Fees" },
  { value: "volume", label: "Volume" },
  { value: "winrate", label: "Win rate" },
];
export const RANGE_OPTIONS: MenuOption<BoardRange>[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

/** The metric as it reads mid-sentence. */
const METRIC_WORD: Record<BoardMetric, string> = { pnl: "PnL", fees: "fees", volume: "volume", winrate: "win rate" };
const RANGE_WORD: Record<BoardRange, string> = { "7d": "7 days", "30d": "30 days", all: "all time" };

/** Playful lead-ins, one per metric. The metric word itself follows, so the plain name stays visible. */
const PLAYFUL: Record<BoardView, Record<BoardMetric, string>> = {
  members: {
    pnl: "Biggest splashes by",
    fees: "Who's farming the most",
    volume: "Making the most waves by",
    winrate: "Sharpest swimmers by",
  },
  countries: {
    pnl: "Countries making the biggest splashes by",
    fees: "Countries farming the most",
    volume: "Countries making the most waves by",
    winrate: "Countries with the sharpest swimmers by",
  },
};

/** Plain sentence for screen readers and the document (no menu chrome). */
export function headingText(view: BoardView, metric: BoardMetric, range: BoardRange, playful: boolean): string {
  const lead = playful ? PLAYFUL[view][metric] : `Top ${view === "countries" ? "countries" : "LPs"} by`;
  return `${lead} ${METRIC_WORD[metric]} ${range === "all" ? "of" : playful ? "in" : "over"} ${RANGE_WORD[range]}`;
}

/* -------------------------------------------------------------------------------------------------- */

/**
 * An inline word that opens a small radio menu (WAI-ARIA menu button pattern):
 * Enter / Space / ArrowDown open on the checked item, ArrowUp opens on the last; arrows, Home and End
 * move; Enter / Space pick; Esc or Tab close and return focus to the word; a click outside closes.
 */
export function WordMenu<T extends string>({
  value,
  options,
  onChange,
  menuLabel,
  children,
  testId,
}: {
  value: T;
  options: MenuOption<T>[];
  onChange: (v: T) => void;
  menuLabel: string;
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const startAt = useRef<"checked" | "last">("checked");
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setPos(null);
    if (refocus) btn.current?.focus();
  }, []);
  const openMenu = (at: "checked" | "last") => {
    startAt.current = at;
    setOpen(true);
  };

  // Place under the word, kept inside the viewport (phones), then focus the starting item.
  useLayoutEffect(() => {
    if (!open || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = menu.current.offsetWidth;
    // Page coordinates (absolute, not fixed): the menu scrolls with its word, so a scroll never needs to close it.
    setPos({ left: window.scrollX + Math.max(8, Math.min(r.left, document.documentElement.clientWidth - w - 8)), top: window.scrollY + r.bottom + 8 });
    const all = items();
    const target = startAt.current === "last" ? all[all.length - 1] : (all.find((el) => el.getAttribute("aria-checked") === "true") ?? all[0]);
    target?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Node;
      if (menu.current?.contains(t) || btn.current?.contains(t)) return;
      close(false);
    };
    // Width only: mobile browsers fire resize as the address bar shows/hides while scrolling.
    const width = window.innerWidth;
    const onResize = () => window.innerWidth !== width && close(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  const onMenuKey = (ev: React.KeyboardEvent) => {
    const all = items();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => {
      ev.preventDefault();
      all[(n + all.length) % all.length]?.focus();
    };
    if (ev.key === "ArrowDown") go(i + 1);
    else if (ev.key === "ArrowUp") go(i - 1);
    else if (ev.key === "Home") go(0);
    else if (ev.key === "End") go(all.length - 1);
    else if (ev.key === "Escape" || ev.key === "Tab") {
      ev.preventDefault();
      close(true);
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : openMenu("checked"))}
        onKeyDown={(ev) => {
          if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            openMenu(ev.key === "ArrowUp" ? "last" : "checked");
          }
        }}
        className="group/word inline-flex items-baseline gap-[0.12em] whitespace-nowrap rounded-tag text-accent transition-colors hover:text-accent-hover"
        data-testid={testId}
      >
        <span className="underline decoration-accent/45 decoration-dotted decoration-[0.06em] underline-offset-[0.18em] transition-colors group-hover/word:decoration-accent group-aria-expanded/word:decoration-accent">
          {children}
        </span>
        <svg viewBox="0 0 20 20" className="h-[0.42em] w-[0.42em] shrink-0 self-center transition-transform group-aria-expanded/word:rotate-180" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={menuLabel}
            onKeyDown={onMenuKey}
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
            className="absolute z-50 w-44 rounded-tile border border-border bg-surface p-1 shadow-lg shadow-black/40"
            data-testid={testId ? `${testId}-menu` : undefined}
          >
            {options.map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  tabIndex={-1}
                  onClick={() => {
                    if (!on) onChange(o.value);
                    close(true);
                  }}
                  className={`flex h-9 w-full items-center justify-between gap-3 rounded-[8px] px-3 text-left text-base font-medium transition-colors hover:bg-surface-raised focus-visible:bg-surface-raised ${on ? "text-fg" : "text-mute hover:text-fg"}`}
                >
                  {o.label}
                  {on && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-accent" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.5 6.2l2.2 2.3 4.8-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

/* -------------------------------------------------------------------------------------------------- */

/** "Fresh from Meteora · 2m ago": a quiet status, not a subtitle. Re-renders each 30s so the age stays true. */
export function LiveStatus({ updatedAt, className = "" }: { updatedAt: string | null; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <p className={`flex items-center gap-2 text-sm text-mute ${className}`} data-testid="live-status" title={updatedAt ? new Date(updatedAt).toLocaleString() : undefined}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-up" aria-hidden="true" />
      <span>
        Fresh from Meteora{updatedAt && <span className="num"> · {timeAgo(updatedAt)}</span>}
      </span>
    </p>
  );
}

/** Thin vertical rule between quiet control groups. */
export const Sep = ({ className = "hidden sm:block" }: { className?: string }) => <span className={`h-4 w-px bg-border ${className}`} aria-hidden="true" />;

/* -------------------------------------------------------------------------------------------------- */

interface HeadingProps {
  view: BoardView;
  metric: BoardMetric;
  range: BoardRange;
  onMetric: (m: BoardMetric) => void;
  onRange: (r: BoardRange) => void;
  updatedAt: string | null;
  /** Members / Countries switch. */
  viewToggle: ReactNode;
  /** Country filter + Following (members only; may be null). */
  filters: ReactNode;
  /** The 7D / 30D / All text toggle (variants B and C). */
  rangeToggle: ReactNode;
  testId?: string;
}

/** A: one sentence; metric and range are menu words inside it. */
export function HeadingSentence({ playful, ...p }: HeadingProps & { playful: boolean }) {
  const lead = playful ? PLAYFUL[p.view][p.metric] : `Top ${p.view === "countries" ? "countries" : "LPs"} by`;
  const joiner = p.range === "all" ? "of" : playful ? "in" : "over";
  return (
    <div data-testid="heading-variant-a">
      <h1 className="max-w-[22ch] text-2xl font-bold leading-[1.15] tracking-tight text-fg [text-wrap:balance] md:max-w-none md:text-3xl" data-testid={p.testId}>
        {lead}{" "}
        <WordMenu value={p.metric} options={METRIC_OPTIONS} onChange={p.onMetric} menuLabel="Rank by" testId="metric-word">
          {METRIC_WORD[p.metric]}
        </WordMenu>{" "}
        {joiner}{" "}
        <WordMenu value={p.range} options={RANGE_OPTIONS} onChange={p.onRange} menuLabel="Time range" testId="range-word">
          {RANGE_WORD[p.range]}
        </WordMenu>
      </h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <LiveStatus updatedAt={p.updatedAt} />
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2" data-testid="board-filters">
          {p.viewToggle}
          {p.filters}
        </div>
      </div>
    </div>
  );
}

/** B: small lead-in (with the live status on the same line), big inline metric words, controls on their baseline. */
export function HeadingWords(p: HeadingProps) {
  return (
    <div data-testid="heading-variant-b">
      <h1 className="sr-only" data-testid={p.testId}>
        {headingText(p.view, p.metric, p.range, false)}
      </h1>
      <div className="flex items-center justify-between gap-4">
        <span className="text-md font-semibold text-mute" aria-hidden="true">
          Top {p.view === "countries" ? "countries" : "LPs"} by
        </span>
        <LiveStatus updatedAt={p.updatedAt} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div role="group" aria-label="Rank by" className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {METRIC_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={p.metric === o.value}
              onClick={() => p.onMetric(o.value)}
              className="whitespace-nowrap rounded-tag text-xl font-bold tracking-tight text-mute transition-colors hover:text-fg-secondary aria-pressed:text-fg sm:text-2xl"
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 pb-0.5" data-testid="board-filters">
          {p.rangeToggle}
          <Sep />
          {p.viewToggle}
          {p.filters}
        </div>
      </div>
    </div>
  );
}

/** C: playful sentence with the metric menu; range is a one-tap text toggle on the status line. */
export function HeadingHybrid(p: HeadingProps) {
  return (
    <div data-testid="heading-variant-c">
      <h1 className="text-2xl font-bold leading-[1.15] tracking-tight text-fg [text-wrap:balance] md:text-3xl" data-testid={p.testId}>
        {PLAYFUL[p.view][p.metric]}{" "}
        <WordMenu value={p.metric} options={METRIC_OPTIONS} onChange={p.onMetric} menuLabel="Rank by" testId="metric-word">
          {METRIC_WORD[p.metric]}
        </WordMenu>
        <span className="sr-only">, {RANGE_WORD[p.range]}</span>
      </h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {p.rangeToggle}
          <Sep className="h-3.5" />
          <LiveStatus updatedAt={p.updatedAt} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2" data-testid="board-filters">
          {p.viewToggle}
          {p.filters}
        </div>
      </div>
    </div>
  );
}
