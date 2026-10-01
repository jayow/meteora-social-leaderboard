"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LeaderboardEntry } from "@/lib/api-types";
import { Avatar, Flag } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";
import { RankMedal, isMedalRank } from "@/components/RankMedal";
import { BadgeRow } from "@/components/Badges";
import type { FollowListKind } from "@/components/FollowListModal";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";

const W = 288;
const GAP = 10;
const EDGE = 8;

/**
 * Small opaque preview for a leaderboard LP, anchored next to the hovered / focused podium card or
 * row (desktop). Portaled to <body> with fixed positioning so it never gets clipped by the list.
 */
export function LeaderboardHoverCard({
  entry,
  anchor,
  rankLabel,
  isMe,
  onPointerEnter,
  onPointerLeave,
  onOpenList,
}: {
  entry: LeaderboardEntry;
  anchor: DOMRect;
  rankLabel: string;
  isMe: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
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

  const name = entry.xName || displayName(entry);
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

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${name} preview`}
      data-testid="hover-card"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="fixed z-40 rounded-2xl border border-border-strong bg-surface p-4 shadow-xl shadow-black/40"
      style={{ width: W, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      <div className="flex items-center gap-3">
        <Avatar user={entry} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-bold">{name}</span>
            <Flag code={entry.country} className="shrink-0" />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-mute">
            {isMedalRank(entry.rank) && <RankMedal rank={entry.rank} size={15} />}
            <span className="truncate">{rankLabel}</span>
            {isMe && <span className="shrink-0 text-fg-secondary">· You</span>}
          </div>
        </div>
      </div>

      <BadgeRow badges={entry.badges} max={4} size="sm" className="mt-3" />

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-[11px] text-mute">{s.label}</dt>
            <dd className={`num text-[14px] font-semibold ${s.tone ?? "text-fg"}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center gap-3 text-[12px] text-mute">
        <button type="button" onClick={() => onOpenList("followers")} className="hover:text-fg" data-testid="hover-followers">
          <span className="font-semibold text-fg-secondary">{entry.followersCount ?? 0}</span> {entry.followersCount === 1 ? "follower" : "followers"}
        </button>
        <button type="button" onClick={() => onOpenList("following")} className="hover:text-fg" data-testid="hover-following">
          <span className="font-semibold text-fg-secondary">{entry.followingCount ?? 0}</span> following
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {!isMe && <FollowButton targetUser={entry} size="sm" />}
        <Link href={`/profile/${entry.xHandle || entry.id}`} className="btn-secondary flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold">
          View profile
        </Link>
      </div>
    </div>,
    document.body,
  );
}
