"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LeaderboardEntry } from "@/lib/api-types";
import { Avatar, Flag } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";
import { BadgeRow } from "@/components/Badges";
import type { FollowListKind } from "@/components/FollowListModal";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";

const W = 288;
const GAP = 10;
const EDGE = 8;

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Small opaque preview for a leaderboard LP, anchored next to the hovered / focused / long-pressed
 * podium card or row. Portaled to <body> with fixed positioning so it never gets clipped by the list.
 * - mouse: closes when the pointer leaves (with a grace period, handled by the page);
 * - keyboard: Tab from the card's link enters it; Tab past the end / Shift+Tab past the start leaves;
 * - touch: a tap-friendly popover with an invisible tap-outside layer; Esc or a tap outside closes it.
 */
export function LeaderboardHoverCard({
  entry,
  anchor,
  rankLabel,
  isMe,
  mode = "mouse",
  onPointerEnter,
  onPointerLeave,
  onFocusInside,
  onFocusOutside,
  onKeyboardExit,
  onDismiss,
  onOpenList,
}: {
  entry: LeaderboardEntry;
  anchor: DOMRect;
  rankLabel: string;
  isMe: boolean;
  mode?: "mouse" | "keyboard" | "touch";
  onPointerEnter: () => void;
  onPointerLeave: (ev: React.PointerEvent<HTMLDivElement>) => void;
  /** Focus moved into the card (keep it open). */
  onFocusInside?: () => void;
  /** Focus left the card for somewhere else on the page. */
  onFocusOutside?: () => void;
  /** Tab past the last control / Shift+Tab before the first. */
  onKeyboardExit?: (dir: "forward" | "back") => void;
  /** Tap outside (touch mode). */
  onDismiss?: () => void;
  onOpenList: (kind: FollowListKind) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Right of the anchor if it fits, else left, else below; then clamp into the viewport.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.right + GAP;
    let top = anchor.top;
    if (left + W > vw - EDGE) left = anchor.left - GAP - W;
    if (left < EDGE) {
      left = Math.min(Math.max(anchor.left, EDGE), vw - W - EDGE);
      top = anchor.bottom + GAP;
      if (top + h > vh - EDGE) top = anchor.top - GAP - h;
    }
    top = Math.min(Math.max(top, EDGE), vh - h - EDGE);
    setPos({ left, top });
  }, [anchor]);

  // Same name as the row it previews.
  const name = displayName(entry);
  const stats: { label: string; value: string; tone?: string }[] = [
    {
      label: "PnL",
      value: fmtUsd(entry.pnl, { signed: true }),
      tone: (entry.pnl ?? 0) >= 0 ? "text-up" : "text-dn",
    },
    { label: "Fees", value: fmtUsd(entry.fees), tone: "text-up" },
    { label: "Volume", value: fmtUsd(entry.volume) },
    { label: "Win rate", value: fmtPct(entry.winRate) },
  ];

  const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "Tab" || !onKeyboardExit || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    if (!ev.shiftKey && document.activeElement === items[items.length - 1]) {
      ev.preventDefault();
      onKeyboardExit("forward");
    } else if (ev.shiftKey && document.activeElement === items[0]) {
      ev.preventDefault();
      onKeyboardExit("back");
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {mode === "touch" && (
        // Invisible tap-outside layer (the board stays visible; the card itself is opaque).
        <div aria-hidden className="fixed inset-0 z-40" data-testid="hover-card-dismiss" onClick={onDismiss} onContextMenu={(ev) => ev.preventDefault()} />
      )}
      <div
        ref={ref}
        role="dialog"
        aria-label={`${name} preview`}
        data-testid="hover-card"
        data-mode={mode}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocusInside}
        onBlur={(ev) => {
          const next = ev.relatedTarget as Node | null;
          if (next && !ev.currentTarget.contains(next)) onFocusOutside?.();
        }}
        onKeyDown={onKeyDown}
        className={`fixed z-40 rounded-card border border-border-strong bg-surface p-4 shadow-lg shadow-black/40 ${mode === "touch" ? "[-webkit-touch-callout:none]" : ""}`}
        style={{ width: W, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      >
        <div className="flex items-center gap-3">
          <Avatar user={entry} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-md font-semibold">{name}</span>
              <Flag code={entry.country} className="shrink-0" />
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-sm text-mute">
              <span className="truncate">{rankLabel}</span>
              {isMe && <span className="chip ml-1">You</span>}
            </div>
          </div>
        </div>

        <BadgeRow badges={entry.badges} max={4} size="sm" className="mt-3" />

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-sm text-mute">{s.label}</dt>
              <dd className={`num text-md font-semibold ${s.tone ?? "text-fg"}`}>{s.value}</dd>
            </div>
          ))}
        </dl>

        {/* Counts and actions share one line; "View profile" only on touch, where tapping the row opened this card. */}
        <div className={`mt-3 flex items-center gap-4 text-sm text-mute ${mode === "touch" ? "[&>button]:py-1.5" : ""}`}>
          <button type="button" onClick={() => onOpenList("followers")} className="transition hover:text-fg" data-testid="hover-followers">
            <span className="num font-semibold text-fg">{entry.followersCount ?? 0}</span> {entry.followersCount === 1 ? "follower" : "followers"}
          </button>
          <button type="button" onClick={() => onOpenList("following")} className="transition hover:text-fg" data-testid="hover-following">
            <span className="num font-semibold text-fg">{entry.followingCount ?? 0}</span> following
          </button>
          {!isMe && mode !== "touch" && (
            <span className="ml-auto">
              <FollowButton targetUser={entry} size="sm" />
            </span>
          )}
        </div>

        {mode === "touch" && (
          <div className="mt-3 flex items-center gap-2">
            {!isMe && <FollowButton targetUser={entry} size="sm" />}
            <Link href={`/profile/${entry.xHandle || entry.id}`} className="btn-secondary h-8 px-3">
              View profile
            </Link>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
