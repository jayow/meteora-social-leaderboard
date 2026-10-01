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
  const otherMembers = members.filter((m) => !m.isFollowed);
  
  const displayMembers = isSignedIn && followedMembers.length > 0 
    ? followedMembers 
    : members;

  const maxDisplay = 5;
  const visibleMembers = displayMembers.slice(0, maxDisplay);
  const remainingCount = displayMembers.length - maxDisplay;

  const followedCount = followedMembers.length;
  const otherCount = otherMembers.length;

  const getLabel = () => {
    if (!isSignedIn) {
      return `${members.length} ${members.length === 1 ? "member" : "members"} here`;
    }

    if (followedCount === 0) {
      return `${otherCount} ${otherCount === 1 ? "member" : "members"} here`;
    }

    const friendNames = followedMembers
      .slice(0, 2)
      .map((m) => displayName(m))
      .join(", ");

    const moreFriends = followedCount > 2 ? ` +${followedCount - 2}` : "";
    const friendText = followedCount === 1 
      ? `${friendNames} here`
      : `${friendNames}${moreFriends} friends here`;

    if (otherCount > 0) {
      return (
        <>
          <span className="font-semibold text-orange">{friendText}</span>
          <span className="text-mute"> · +{otherCount} {otherCount === 1 ? "member" : "members"}</span>
        </>
      );
    }

    return <span className="font-semibold text-orange">{friendText}</span>;
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {visibleMembers.map((member) => {
          const avatar = avatarFor({ xAvatarUrl: member.xAvatarUrl, id: member.userId });
          const title = displayName(member);

          return (
            <Link
              key={`${poolAddress}-${member.userId}`}
              href={`/profile/${member.userId}`}
              title={title}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 transition hover:z-20 hover:scale-110"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatar}
                alt={title}
                className="h-8 w-8 rounded-full border-2 border-base bg-[#1d1a2a] object-cover ring-1 ring-white/10"
                loading="lazy"
              />
            </Link>
          );
        })}
        {remainingCount > 0 && (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-base bg-purp/40 text-[10px] font-bold ring-1 ring-white/10"
            title={`+${remainingCount} more`}
          >
            +{remainingCount}
          </div>
        )}
      </div>
      <div className="text-[12px]">{getLabel()}</div>
    </div>
  );
}
