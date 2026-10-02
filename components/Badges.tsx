"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BADGES, howEarned, sortBadges, tierLabel, type ApiBadge, type BadgeId, type BadgeTier } from "@/lib/badges/config";

/**
 * Member badges: small flat chips (inline SVG, theme tokens) with a tooltip on hover, focus or tap.
 * Tiered badges use the metal tokens (bronze / silver / gold for tiers 1 / 2 / 3); untiered stay neutral.
 * Renders nothing when there are no badges.
 */

const TIER_TONE: Record<BadgeTier, string> = { 1: "text-bronze", 2: "text-silver", 3: "text-gold" };
/** Tiered chips get a light metal tint and border (THEME.md "Medals"); untiered stay neutral. */
const TIER_CHIP: Record<BadgeTier, string> = {
  1: "border-bronze/40 bg-bronze/[.08] hover:border-bronze/70 focus-visible:border-bronze/70",
  2: "border-silver/40 bg-silver/[.08] hover:border-silver/70 focus-visible:border-silver/70",
  3: "border-gold/40 bg-gold/[.08] hover:border-gold/70 focus-visible:border-gold/70",
};
const NEUTRAL_CHIP = "border-border bg-surface-raised hover:border-border-strong focus-visible:border-border-strong";

/** Glyph colour: metal for tiered badges, `up` for In the Green, neutral otherwise. */
export function badgeTone(id: BadgeId, tier: BadgeTier): string {
  if (BADGES[id].tiered) return TIER_TONE[tier];
  return id === "in_the_green" ? "text-up" : "text-fg-secondary";
}

function chipTone(id: BadgeId, tier: BadgeTier): string {
  return `${badgeTone(id, tier)} ${BADGES[id].tiered ? TIER_CHIP[tier] : NEUTRAL_CHIP}`;
}

/** 16x16 line glyphs, drawn with currentColor. */
export function BadgeGlyph({ id, size = 12, className = "" }: { id: BadgeId; size?: number; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (id) {
    case "first_splash":
      return (
        <svg {...common}>
          <path d="M8 2.2c2.3 2.8 4.1 5 4.1 7.3a4.1 4.1 0 0 1-8.2 0c0-2.3 1.8-4.5 4.1-7.3z" />
        </svg>
      );
    case "fee_farmer":
      return (
        <svg {...common}>
          <path d="M8 14V7.2" />
          <path d="M8 9.6C8 7.3 6.2 5.8 3.6 5.8c0 2.3 1.8 3.8 4.4 3.8z" />
          <path d="M8 7.2c0-2.4 1.9-4 4.5-4 0 2.4-1.9 4-4.5 4z" />
        </svg>
      );
    case "whale_volume":
      return (
        <svg {...common}>
          <path d="M1.8 6.2q1.55-1.6 3.1 0t3.1 0 3.1 0 3.1 0" />
          <path d="M1.8 10.6q1.55-1.6 3.1 0t3.1 0 3.1 0 3.1 0" />
        </svg>
      );
    case "sharpshooter":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.6" />
          <circle cx="8" cy="8" r="2.6" />
          <circle cx="8" cy="8" r="0.6" fill="currentColor" />
        </svg>
      );
    case "in_the_green":
      return (
        <svg {...common}>
          <path d="M2 11.8l4-4 2.6 2.6L14 5" />
          <path d="M10.2 5H14v3.8" />
        </svg>
      );
    case "pool_hopper":
      return (
        <svg {...common}>
          <ellipse cx="3.8" cy="12" rx="2" ry="1.1" />
          <ellipse cx="12.2" cy="12" rx="2" ry="1.1" />
          <path d="M3.8 9.4C5 4.6 11 4.6 12.2 9.4" strokeDasharray="1.6 1.9" />
        </svg>
      );
    case "podium":
      return (
        <svg {...common}>
          <path d="M1.8 13.6h12.4" />
          <path d="M5.6 13.6V5.8h4.8v7.8" />
          <path d="M1.8 13.6V9.2h3.8" />
          <path d="M10.4 13.6V7.6h3.8v6" />
        </svg>
      );
  }
}

const EDGE = 8;
const GAP = 6;

/**
 * Trigger + tooltip. Opens on mouse hover, keyboard focus, or tap (touch/pen); closes on leave, blur,
 * Escape, outside tap or scroll. The tooltip is portaled with fixed positioning so cards never clip it.
 */
function Tip({ label, content, className, children, testId }: { label: string; content: ReactNode; className: string; children: ReactNode; testId?: string }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const pointer = useRef<string>("mouse");
  // True between pointerdown and click, so a tap's focus event doesn't open (the click toggles instead).
  const pressing = useRef(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) {
      setPos(null);
      return;
    }
    const r = btn.current.getBoundingClientRect();
    const w = tip.current.offsetWidth;
    const h = tip.current.offsetHeight;
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, EDGE), window.innerWidth - w - EDGE);
    let top = r.top - GAP - h;
    if (top < EDGE) top = r.bottom + GAP;
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (btn.current && e.target instanceof Node && btn.current.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        data-testid={testId}
        className={className}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
          pressing.current = true;
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setOpen(false);
        }}
        onFocus={() => {
          if (!pressing.current) setOpen(true);
        }}
        onBlur={() => {
          pressing.current = false;
          setOpen(false);
        }}
        onClick={(e) => {
          // Keep taps inside cards/rows from triggering their own handlers.
          e.stopPropagation();
          const wasPress = pressing.current;
          pressing.current = false;
          if (wasPress && pointer.current !== "mouse") setOpen((o) => !o);
        }}
      >
        {children}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            data-testid="badge-tooltip"
            className="pointer-events-none fixed z-[60] w-max max-w-[240px] rounded-tile border border-border-strong bg-surface-raised px-3 py-2 shadow-lg shadow-black/40"
            style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}

const SIZES = {
  sm: { chip: "h-5 w-5", more: "h-5 min-w-5", glyph: 11 },
  md: { chip: "h-6 w-6", more: "h-6 min-w-6", glyph: 13 },
} as const;

function fmtEarned(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function BadgeChip({ badge, size = "md" }: { badge: ApiBadge; size?: keyof typeof SIZES }) {
  const def = BADGES[badge.id];
  const tier = tierLabel(badge.id, badge.tier);
  const how = howEarned(badge);
  const s = SIZES[size];
  return (
    <Tip
      label={`${def.name}${tier ? `, ${tier}` : ""}: ${how}`}
      testId="badge"
      className={`inline-flex ${s.chip} shrink-0 items-center justify-center rounded-full border transition-colors ${chipTone(badge.id, badge.tier)}`}
      content={
        <>
          <div className="flex items-center gap-1.5">
            <BadgeGlyph id={badge.id} size={12} className={badgeTone(badge.id, badge.tier)} />
            <span className="text-sm font-semibold text-fg">{def.name}</span>
          </div>
          {tier && <div className="mt-0.5 text-xs text-fg-secondary">{tier}</div>}
          <div className="mt-1 text-sm leading-snug text-fg-secondary">{how}</div>
          <div className="mt-1 text-xs text-mute">Earned {fmtEarned(badge.earnedAt)}</div>
        </>
      }
    >
      <BadgeGlyph id={badge.id} size={s.glyph} />
    </Tip>
  );
}

/** A compact row of badge chips; `max` shows that many plus a "+N" chip listing the rest. */
export function BadgeRow({
  badges,
  max,
  size = "md",
  className = "",
}: {
  badges: ApiBadge[] | null | undefined;
  max?: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (!badges || badges.length === 0) return null;
  const sorted = sortBadges(badges);
  const shown = max ? sorted.slice(0, max) : sorted;
  const rest = sorted.slice(shown.length);
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`} data-testid="badge-row" aria-label="Badges">
      {shown.map((b) => (
        <BadgeChip key={b.id} badge={b} size={size} />
      ))}
      {rest.length > 0 && (
        <Tip
          label={`${rest.length} more badges: ${rest.map((b) => BADGES[b.id].name).join(", ")}`}
          testId="badge-more"
          className={`inline-flex ${SIZES[size].more} shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised px-1.5 text-xs font-semibold text-mute transition-colors hover:border-border-strong hover:text-fg-secondary`}
          content={
            <ul className="space-y-1">
              {rest.map((b) => {
                const tier = tierLabel(b.id, b.tier);
                return (
                  <li key={b.id} className="flex items-center gap-1.5 text-sm text-fg-secondary">
                    <BadgeGlyph id={b.id} size={12} className={badgeTone(b.id, b.tier)} />
                    <span className="font-semibold text-fg">{BADGES[b.id].name}</span>
                    {tier && <span className="text-mute">· {tier.split(" · ")[0]}</span>}
                  </li>
                );
              })}
            </ul>
          }
        >
          +{rest.length}
        </Tip>
      )}
    </div>
  );
}
