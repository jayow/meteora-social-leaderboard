"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ApiUser } from "@/lib/api-types";
import { Avatar } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";
import { displayName } from "@/lib/format";
import { onFollowChanged } from "@/lib/session-events";

export type FollowListKind = "followers" | "following";

type ListItem = ApiUser & { followedAt: string; isFollowing: boolean };

interface ListResponse {
  followers?: ListItem[];
  following?: ListItem[];
  hasMore: boolean;
}

const PAGE = 50;

/** Opaque, subtle list of a user's followers / people they follow, each with a Follow button. */
export function FollowListModal({
  userId,
  kind,
  onClose,
}: {
  userId: number;
  kind: FollowListKind;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const dialogRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(
    async (offset: number) => {
      const res = await fetch(`/api/users/${userId}/${kind}?limit=${PAGE}&offset=${offset}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as ListResponse;
      return { list: (kind === "followers" ? data.followers : data.following) ?? [], hasMore: data.hasMore };
    },
    [userId, kind]
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setItems([]);
    fetchPage(0)
      .then(({ list, hasMore: more }) => {
        if (cancelled) return;
        setItems(list);
        setHasMore(more);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    try {
      const { list, hasMore: more } = await fetchPage(items.length);
      setItems((prev) => [...prev, ...list.filter((n) => !prev.some((p) => p.id === n.id))]);
      setHasMore(more);
    } catch {
      setStatus("error");
    }
  };

  // Rows keep their Follow button in sync with clicks anywhere else.
  useEffect(
    () =>
      onFollowChanged((change) =>
        setItems((prev) => prev.map((u) => (u.id === change.targetId ? { ...u, isFollowing: change.following } : u)))
      ),
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = kind === "followers" ? "Followers" : "Following";

  // Portal to <body>: callers can sit inside `.glass` cards whose backdrop-filter would otherwise
  // trap this fixed overlay inside the card.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="follow-list"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#1A1623] shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-3.5">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-white/[.06] hover:text-white">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {status === "loading" && <p className="px-3 py-6 text-center text-[13px] text-mute">Loading…</p>}
          {status === "error" && <p className="px-3 py-6 text-center text-[13px] text-mute">Couldn&apos;t load this list.</p>}
          {status === "idle" && items.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-mute">
              {kind === "followers" ? "No followers yet." : "Not following anyone yet."}
            </p>
          )}
          {items.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white/[.04]" data-testid="follow-list-row">
              <Link href={`/profile/${u.xHandle || u.id}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={u} size={36} />
                <span className="truncate text-[14px] font-semibold">{u.xName || displayName(u)}</span>
              </Link>
              <FollowButton targetUser={u} size="sm" />
            </div>
          ))}
          {status === "idle" && hasMore && (
            <button type="button" onClick={() => void loadMore()} className="mt-1 w-full rounded-xl py-2 text-[13px] font-semibold text-mute hover:bg-white/[.04] hover:text-white">
              Show more
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
