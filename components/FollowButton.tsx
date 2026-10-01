"use client";

import { useEffect, useRef, useState } from "react";
import { useMe } from "@/components/MeProvider";
import { notifyFollowChanged, onFollowChanged, requestSignIn } from "@/lib/session-events";

export function FollowButton({
  targetUser,
  size = "md",
  className = "",
}: {
  targetUser: { id: number; isFollowing?: boolean };
  size?: "sm" | "md";
  className?: string;
}) {
  const { verified, userId, sessionChecked } = useMe();
  const [isFollowing, setIsFollowing] = useState(targetUser.isFollowing ?? false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  // The same component instance can be reused for a different user (e.g. the leaderboard sidebar),
  // and parents refetch: follow the props when they change.
  useEffect(() => {
    if (!pendingRef.current) setIsFollowing(targetUser.isFollowing ?? false);
  }, [targetUser.id, targetUser.isFollowing]);

  // Keep every button for this user in sync (podium, row, sidebar card, profile, pool list).
  useEffect(
    () =>
      onFollowChanged((change) => {
        if (change.targetId === targetUser.id) setIsFollowing(change.following);
      }),
    [targetUser.id]
  );

  if (userId !== null && userId === targetUser.id) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pendingRef.current) return;
    if (sessionChecked && !verified) {
      requestSignIn();
      return;
    }

    const targetId = targetUser.id;
    const next = !isFollowing;
    // Optimistic: flip immediately everywhere, then confirm (or revert) with the server.
    pendingRef.current = true;
    setPending(true);
    setIsFollowing(next);
    notifyFollowChanged({ targetId, following: next });
    try {
      const res = await fetch("/api/follow", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
        // Finish even if the user navigates away right after clicking.
        keepalive: true,
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          following?: boolean;
          followersCount?: number;
          viewerFollowingCount?: number;
        };
        notifyFollowChanged({
          targetId,
          following: data.following ?? next,
          followersCount: data.followersCount,
          viewerFollowingCount: data.viewerFollowingCount,
        });
        return;
      }
      setIsFollowing(!next);
      notifyFollowChanged({ targetId, following: !next });
      if (res.status === 401) requestSignIn();
    } catch {
      setIsFollowing(!next);
      notifyFollowChanged({ targetId, following: !next });
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const sizeClasses = size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-9 px-4 text-[13px]";
  const tone = !verified
    ? "bg-orange shadow-lg shadow-orange/25 hover:bg-orange-soft"
    : isFollowing
      ? "bg-white/[.08] hover:bg-white/[.14]"
      : "bg-white text-black hover:bg-white/90";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={verified ? isFollowing : undefined}
      aria-busy={pending || undefined}
      className={`${sizeClasses} rounded-full font-bold transition ${tone} ${className}`}
    >
      {verified && isFollowing ? "Following" : "Follow"}
    </button>
  );
}
