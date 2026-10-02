"use client";

/**
 * Leaderboard heading. A compact control line sits first and never moves ("30 days ▾ · ranked by PnL ▾",
 * the range word reserves the width of its longest option), the playful headline sits under it
 * ("Biggest splashes"), then a quiet live status and the Members / Countries, country and Following controls.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { timeAgo } from "@/lib/format";

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

/** Playful headline, one per metric. The plain metric name sits in the control line right above it. */
const PLAYFUL: Record<BoardView, Record<BoardMetric, string>> = {
  members: {
    pnl: "Biggest splashes",
    fees: "Who's farming the most fees",
    volume: "Making the most waves",
    winrate: "Sharpest swimmers",
  },
  countries: {
    pnl: "Countries making the biggest splashes",
    fees: "Countries farming the most fees",
    volume: "Countries making the most waves",
    winrate: "Countries with the sharpest swimmers",
  },
};

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
  reserve,
  testId,
}: {
  value: T;
  options: MenuOption<T>[];
  onChange: (v: T) => void;
  menuLabel: string;
  children: ReactNode;
  /** Words to reserve width for (stacked invisibly in one grid cell), so whatever follows never shifts. */
  reserve?: string[];
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const startAt = useRef<"checked" | "last">("checked");
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
  // Focus always returns to the word; after a mouse/touch pick it does so without the keyboard focus ring.
  const close = useCallback((refocus: boolean, byPointer = false) => {
    setOpen(false);
    setPos(null);
    if (refocus) btn.current?.focus({ preventScroll: true, focusVisible: !byPointer } as FocusOptions & { focusVisible: boolean });
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
        className="group/word inline-flex items-baseline gap-1 whitespace-nowrap rounded-tag text-accent transition-colors hover:text-accent-hover"
        data-testid={testId}
      >
        {/* No resting underline (it read like a spellcheck mark): orange + chevron, a thin solid line on hover / focus. */}
        <span className="inline-grid">
          {reserve?.map((r) => (
            <span key={r} className="invisible col-start-1 row-start-1" aria-hidden="true">
              {r}
            </span>
          ))}
          <span className="col-start-1 row-start-1 decoration-accent/50 decoration-1 underline-offset-[0.25em] group-hover/word:underline group-focus-visible/word:underline">{children}</span>
        </span>
        <svg viewBox="0 0 20 20" className="h-[0.8em] w-[0.8em] shrink-0 self-center transition-transform group-aria-expanded/word:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
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
                  onClick={(ev) => {
                    if (!on) onChange(o.value);
                    // detail is 0 for Enter / Space, the click count for a real pointer click.
                    close(true, ev.detail > 0);
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
  /** Country filter + Following, each followed by a Sep (members only; may be null). Rendered before the view toggle on desktop. */
  filters: ReactNode;
  testId?: string;
}

/**
 * The heading. The playful headline comes first (fixed height, two lines reserved on phones), then the
 * control line: range (width reserved for its longest option), "ranked by" and the metric, which ends the
 * line so its length moves nothing. Menus open under their word, so each always opens in the same place.
 */
export function BoardHeading(p: HeadingProps) {
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === p.range)?.label ?? "30 days";
  return (
    <div>
      {/* Phones reserve two lines so the controls below don't jump between metrics. */}
      <h1 className="min-h-[2.3em] text-2xl font-bold leading-[1.15] tracking-tight text-fg [text-wrap:balance] sm:min-h-0 md:text-3xl" data-testid={p.testId}>
        {PLAYFUL[p.view][p.metric]}
        <span className="sr-only">
          , {rangeLabel.toLowerCase()}, ranked by {METRIC_WORD[p.metric]}
        </span>
      </h1>
      <div className="mt-2 flex items-baseline gap-2 text-md font-semibold" data-testid="board-controls">
        <WordMenu value={p.range} options={RANGE_OPTIONS} onChange={p.onRange} menuLabel="Time range" reserve={RANGE_OPTIONS.map((o) => o.label)} testId="range-word">
          {rangeLabel}
        </WordMenu>
        <span className="text-mute" aria-hidden="true">
          ·
        </span>
        <span className="text-mute">ranked by</span>
        <WordMenu value={p.metric} options={METRIC_OPTIONS} onChange={p.onMetric} menuLabel="Rank by" testId="metric-word">
          {METRIC_WORD[p.metric]}
        </WordMenu>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <LiveStatus updatedAt={p.updatedAt} />
        {/* Members / Countries is anchored (right end on desktop, first on its own row on phones), so the
            filters that only exist in Members can come and go without moving it. */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-5 gap-y-2 sm:w-auto" data-testid="board-filters">
          <div className="order-first sm:order-last">{p.viewToggle}</div>
          {p.filters}
        </div>
      </div>
    </div>
  );
}
