"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BadgeMedal } from "@/components/BadgeGlyph";
import { BADGES, howEarned, sortBadges, tierLabel, type ApiBadge, type BadgeId, type BadgeTier } from "@/lib/badges/config";

/**
 * Member badges: small medallions (BadgeMedal) with a tooltip on hover, focus or tap.
 * Tiered badges are solid bronze / silver / gold for tiers 1 / 2 / 3; untiered stay neutral.
 * Renders nothing when there are no badges.
 */

const TIER_TONE: Record<BadgeTier, string> = { 1: "text-bronze", 2: "text-silver", 3: "text-gold" };

/** Glyph colour: metal for tiered badges, neutral otherwise (matches the medallion). */
export function badgeTone(id: BadgeId, tier: BadgeTier): string {
  return BADGES[id].tiered ? TIER_TONE[tier] : "text-fg-secondary";
}

export { BadgeGlyph, BadgeMedal } from "@/components/BadgeGlyph";

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
  sm: { medal: 20, more: "h-5 min-w-5" },
  md: { medal: 24, more: "h-6 min-w-6" },
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
      className="inline-flex shrink-0 rounded-full transition-opacity hover:opacity-85"
      content={
        <>
          <div className="flex items-center gap-1.5">
            <BadgeMedal id={badge.id} tier={badge.tier} size={16} />
            <span className="text-sm font-semibold text-fg">{def.name}</span>
          </div>
          {tier && <div className="mt-0.5 text-xs text-fg-secondary">{tier}</div>}
          <div className="mt-1 text-sm leading-snug text-fg-secondary">{how}</div>
          <div className="mt-1 text-xs text-mute">Earned {fmtEarned(badge.earnedAt)}</div>
        </>
      }
    >
      <BadgeMedal id={badge.id} tier={badge.tier} size={s.medal} />
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
                    <BadgeMedal id={b.id} tier={b.tier} size={16} />
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
