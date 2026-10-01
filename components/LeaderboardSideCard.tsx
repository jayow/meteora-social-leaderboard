"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { LeaderboardEntry } from "@/lib/api-types";
import { Avatar, Flag, StatTile } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";
import { FollowListModal, type FollowListKind } from "@/components/FollowListModal";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";

/** Compact desktop sidebar preview for the selected leaderboard LP. The full profile lives at /profile. */
export function LeaderboardSideCard({ user, rangeLabel, isMe }: { user: LeaderboardEntry; rangeLabel: string; isMe: boolean }) {
  const [followList, setFollowList] = useState<FollowListKind | null>(null);
  const closeFollowList = useCallback(() => setFollowList(null), []);
  const name = user.xName || displayName(user);

  return (
    <div className="glass rounded-[28px] p-5" data-testid="side-card">
      <div className="flex items-start gap-3">
        <Avatar user={user} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-[18px] font-extrabold tracking-tight">{name}</h3>
            <Flag code={user.country} className="shrink-0" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-mute">
            {user.rank !== null && <span className="font-semibold text-white/80">#{user.rank} · {rangeLabel}</span>}
            {isMe && <span className="font-semibold text-purp-soft">You</span>}
            {user.xHandle && <span className="truncate">@{user.xHandle}</span>}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[12px] text-mute">
            {user.followersCount !== undefined && (
              <button type="button" onClick={() => setFollowList("followers")} className="hover:text-white" data-testid="card-followers-count">
                <span className="font-semibold text-white/80">{user.followersCount}</span> {user.followersCount === 1 ? "follower" : "followers"}
              </button>
            )}
            {user.followingCount !== undefined && (
              <button type="button" onClick={() => setFollowList("following")} className="hover:text-white" data-testid="card-following-count">
                <span className="font-semibold text-white/80">{user.followingCount}</span> following
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatTile label={`${rangeLabel} PnL`} value={fmtUsd(user.pnl, { signed: true })} tone={(user.pnl ?? 0) >= 0 ? "up" : "dn"} />
        <StatTile label="Fees" value={fmtUsd(user.fees)} />
        <StatTile label="Win rate" value={fmtPct(user.winRate)} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        {!isMe && <FollowButton targetUser={user} size="sm" />}
        <Link
          href={`/profile/${user.xHandle || user.id}`}
          className="flex h-8 items-center rounded-full bg-white/[.08] px-3.5 text-[13px] font-semibold hover:bg-white/[.14]"
          data-testid="side-card-view-profile"
        >
          View profile
        </Link>
      </div>

      {followList && <FollowListModal key={`${user.id}-${followList}`} userId={user.id} kind={followList} onClose={closeFollowList} />}
    </div>
  );
}
