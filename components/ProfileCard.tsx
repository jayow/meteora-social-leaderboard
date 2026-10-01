"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { PoolInfo } from "@/lib/api-types";
import { Avatar, Flag, PoolChip, StatTile, XIcon } from "@/components/ui";
import { PnLCalendar } from "@/components/PnLCalendar";
import { OpenPositions } from "@/components/OpenPositions";
import { FollowButton } from "@/components/FollowButton";
import { FollowListModal, type FollowListKind } from "@/components/FollowListModal";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";

export interface CardUser {
  id: number;
  wallet?: string;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  xVerified?: boolean;
  country: string | null;
  thesis: string | null;
  isFollowing?: boolean;
  followersCount?: number;
  followingCount?: number;
  bannerUpdatedAt?: string | null;
}

export interface CardStats {
  portfolioValue: number | null;
  totalPnl: number | null;
  rangePnl: number | null;
  rangeLabel: string;
  fees: number | null;
  winRate: number | null;
  positionsOpen: number | null;
  positionsClosed: number | null;
  volume: number | null;
  topPool: PoolInfo | null;
}

/** Sidebar profile preview (desktop leaderboard). */
export function ProfileCard({ user, stats, rank, isMe }: { user: CardUser; stats: CardStats; rank?: number; isMe?: boolean }) {
  const [followList, setFollowList] = useState<FollowListKind | null>(null);
  const closeFollowList = useCallback(() => setFollowList(null), []);
  const bannerUrl = user.bannerUpdatedAt ? `/api/users/${user.id}/banner?v=${new Date(user.bannerUpdatedAt).getTime()}` : null;

  return (
    <div className="glass overflow-hidden rounded-[28px]">
      {bannerUrl ? (
        <div className="relative aspect-[3/1] overflow-hidden">
          <img src={bannerUrl} alt="" className="h-full w-full object-cover object-center" />
        </div>
      ) : (
        <div className="brand-grad relative aspect-[3/1] opacity-90">
          <div className="absolute inset-0 bg-[radial-gradient(60%_120%_at_20%_0%,rgba(255,255,255,.25),transparent)]" />
        </div>
      )}
      <div className="px-5 pb-5">
        <div className="relative z-10 -mt-10 flex items-end justify-between">
          <Avatar user={user} size={76} ring />
          <div className="mb-1 flex gap-2">
            {!isMe && <FollowButton targetUser={user} size="sm" />}
            {user.xHandle && (
              <a href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[.08] hover:bg-white/[.14]" title={`@${user.xHandle} on X`}>
                <XIcon className="h-3.5 w-3.5" />
              </a>
            )}
            <Link href={`/profile/${user.xHandle || user.id}`} className="h-8 rounded-full bg-white/[.08] px-3.5 text-[13px] font-semibold leading-8 hover:bg-white/[.14]">
              View
            </Link>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h3 className="text-[22px] font-extrabold tracking-tight">{user.xName || displayName(user)}</h3>
          <Flag code={user.country} />
          {rank != null && <span className="rounded-full bg-orange/15 px-2 py-0.5 text-[11px] font-bold text-orange">#{rank} · {stats.rangeLabel}</span>}
          {isMe && <span className="rounded-full bg-purp/25 px-2 py-0.5 text-[11px] font-bold text-purp-soft">YOU</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-mute">
          {user.xHandle && (
            <a href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">
              @{user.xHandle}{user.xVerified && <> · <XIcon className="h-3 w-3" /> verified</>}
            </a>
          )}
          {user.xHandle && (user.followersCount !== undefined || user.followingCount !== undefined) && <span aria-hidden>·</span>}
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
        {followList && <FollowListModal key={`${user.id}-${followList}`} userId={user.id} kind={followList} onClose={closeFollowList} />}

        <div className="mt-4 rounded-2xl rounded-tl-md border border-purp/20 bg-purp/10 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purp-soft">Thesis</div>
          <p className="mt-1 line-clamp-4 text-[14px] leading-snug text-white/90">{user.thesis ? `“${user.thesis}”` : <span className="text-mute">No thesis yet.</span>}</p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatTile label="Total value" value={fmtUsd(stats.portfolioValue)} />
          <StatTile label={`${stats.rangeLabel} PnL`} value={fmtUsd(stats.rangePnl, { signed: true })} tone={(stats.rangePnl ?? 0) >= 0 ? "up" : "dn"} />
          <StatTile label="Fees earned" value={fmtUsd(stats.fees)} tone="up" />
          <StatTile label="Win rate" value={fmtPct(stats.winRate)} />
          <StatTile label="Positions" value={`${stats.positionsOpen ?? 0} / ${stats.positionsClosed ?? 0}`} sub="open / closed" />
          <StatTile label="Lifetime PnL" value={fmtUsd(stats.totalPnl, { signed: true })} tone={(stats.totalPnl ?? 0) >= 0 ? "up" : "dn"} />
        </div>
        {stats.topPool && (
          <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-mute">
            <span>Top pool</span>
            <PoolChip pool={stats.topPool} />
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-white/[.06] bg-black/20 p-3">
          <PnLCalendar userId={user.id} compact />
        </div>

        <div className="mt-3">
          <OpenPositions userId={user.id} compact />
        </div>
      </div>
    </div>
  );
}
