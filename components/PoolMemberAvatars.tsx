"use client";

import Link from "next/link";
import { avatarFor, displayName } from "@/lib/format";

interface Member {
  userId: number;
  xAvatarUrl: string | null;
  xHandle: string | null;
  anonName?: string | null;
  isFollowed: boolean;
}

interface PoolMemberAvatarsProps {
  poolAddress: string;
  members: Member[];
  isSignedIn: boolean;
}

export function PoolMemberAvatars({ poolAddress, members, isSignedIn }: PoolMemberAvatarsProps) {
  if (members.length === 0) return null;

  const followedMembers = members.filter((m) => m.isFollowed);
  
  const displayMembers = isSignedIn && followedMembers.length > 0 
    ? followedMembers 
    : members;

  // At most three faces plus a "+N"; the row's meta line already says how many LPs are in.
  const maxDisplay = 3;
  const visibleMembers = displayMembers.slice(0, maxDisplay);
  const remainingCount = displayMembers.length - maxDisplay;

  // Name friends when there are some; otherwise the faces say enough.
  const friendLabel = (() => {
    if (!isSignedIn || followedMembers.length === 0) return null;
    const names = followedMembers.slice(0, 2).map((m) => displayName(m)).join(", ");
    const more = followedMembers.length > 2 ? ` +${followedMembers.length - 2}` : "";
    return (
      <>
        <span className="font-semibold text-fg">{names}{more}</span> here
      </>
    );
  })();

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5">
        {visibleMembers.map((member) => {
          const avatar = avatarFor({ xAvatarUrl: member.xAvatarUrl, id: member.userId });
          const title = displayName(member);

          return (
            <Link
              key={`${poolAddress}-${member.userId}`}
              href={`/profile/${member.userId}`}
              title={title}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 hover:z-20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatar}
                alt={title}
                className="h-6 w-6 rounded-full border-2 border-surface bg-surface-raised object-cover"
                loading="lazy"
              />
            </Link>
          );
        })}
        {remainingCount > 0 && (
          <div
            className="num flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-raised px-1 text-xs font-semibold text-fg-secondary"
            title={`+${remainingCount} more`}
          >
            +{remainingCount}
          </div>
        )}
      </div>
      {friendLabel && <div className="text-sm text-mute">{friendLabel}</div>}
    </div>
  );
}
