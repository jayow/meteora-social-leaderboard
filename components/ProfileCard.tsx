"use client";

import Link from "next/link";
import type { PoolInfo } from "@/lib/api-types";
import { Avatar, Flag, PoolChip, StatTile, XIcon } from "@/components/ui";
import { PnLCalendar } from "@/components/PnLCalendar";
import { OpenPositions } from "@/components/OpenPositions";
import { FollowButton } from "@/components/FollowButton";
import { displayName, fmtPct, fmtUsd, shortAddr } from "@/lib/format";

export interface CardUser {
  id: number;
  wallet: string;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  xVerified?: boolean;
  country: string | null;
  thesis: string | null;
  isFollowing?: boolean;
  followersCount?: number;
  followingCount?: number;
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
  return (
    <div className="glass overflow-hidden rounded-[28px]">
      <div className="brand-grad relative h-20 opacity-90">
        <div className="absolute inset-0 bg-[radial-gradient(60%_120%_at_20%_0%,rgba(255,255,255,.25),transparent)]" />
      </div>
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
            <Link href={`/profile/${user.wallet}`} className="h-8 rounded-full bg-white/[.08] px-3.5 text-[13px] font-semibold leading-8 hover:bg-white/[.14]">
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
          <span className="num">{user.xHandle ? "·" : ""} {shortAddr(user.wallet)}</span>
        </div>
        {(user.followersCount !== undefined || user.followingCount !== undefined) && (
          <div className="mt-1.5 flex gap-3 text-[12px]">
            {user.followersCount !== undefined && (
              <span>
                <span className="font-semibold text-white">{user.followersCount}</span> <span className="text-mute">{user.followersCount === 1 ? "follower" : "followers"}</span>
              </span>
            )}
            {user.followingCount !== undefined && (
              <span>
                <span className="font-semibold text-white">{user.followingCount}</span> <span className="text-mute">following</span>
              </span>
            )}
          </div>
        )}

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
          <PnLCalendar walletAddress={user.wallet} compact />
        </div>

        <div className="mt-3">
          <OpenPositions walletAddress={user.wallet} compact />
        </div>
      </div>
    </div>
  );
}
