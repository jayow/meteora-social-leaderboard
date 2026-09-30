"use client";

import { useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMe } from "@/components/MeProvider";

export function FollowButton({
  targetUser,
  size = "md",
  className = "",
}: {
  targetUser: { id: number; isFollowing?: boolean };
  size?: "sm" | "md";
  className?: string;
}) {
  const { wallet, ensureSession } = useMe();
  const { setVisible } = useWalletModal();
  const [isFollowing, setIsFollowing] = useState(targetUser.isFollowing ?? false);
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!wallet) {
      setVisible(true);
      return;
    }

    const verified = await ensureSession();
    if (!verified) return;

    setLoading(true);
    try {
      const endpoint = "/api/follow";
      const method = isFollowing ? "DELETE" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: targetUser.id }),
      });

      if (res.ok) {
        setIsFollowing(!isFollowing);
      }
    } catch (error) {
      console.error("Follow action failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-9 px-4 text-[13px]";

  if (!wallet) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`${sizeClasses} rounded-full bg-orange font-bold shadow-lg shadow-orange/25 hover:bg-orange-soft ${className}`}
        disabled={loading}
      >
        {loading ? "..." : "Follow"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${sizeClasses} rounded-full font-bold ${
        isFollowing
          ? "bg-white/[.08] hover:bg-white/[.14]"
          : "bg-white px-4 text-black hover:bg-white/90"
      } ${className}`}
      disabled={loading}
    >
      {loading ? "..." : isFollowing ? "Following" : "Follow"}
    </button>
  );
}
