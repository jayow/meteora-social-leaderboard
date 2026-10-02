"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ApiUser } from "@/lib/api-types";
import { Avatar } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";
import { Modal, ModalClose } from "@/components/Modal";
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

  const title = kind === "followers" ? "Followers" : "Following";

  return (
    <Modal onClose={onClose} label={title} testId="follow-list" className="flex max-h-[80vh] max-w-sm flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border py-3 pl-5 pr-3">
        <h2 className="text-md font-semibold">{title}</h2>
        <ModalClose onClick={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {status === "loading" && (
          <div aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="skeleton h-9 w-9 rounded-full" />
                <span className="skeleton block h-4 flex-1" />
                <span className="skeleton h-8 w-20 rounded-full" />
              </div>
            ))}
          </div>
        )}
        {status === "error" && <p className="px-3 py-8 text-center text-base text-mute">Couldn&apos;t load this list.</p>}
        {status === "idle" && items.length === 0 && (
          <p className="px-3 py-8 text-center text-base text-mute">{kind === "followers" ? "No followers yet." : "Not following anyone yet."}</p>
        )}
        {items.map((u) => (
          <div key={u.id} className="flex items-center gap-3 rounded-tile px-3 py-2 transition hover:bg-surface-raised" data-testid="follow-list-row">
            <Link href={`/profile/${u.xHandle || u.id}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3 rounded-tag">
              <Avatar user={u} size={36} />
              <span className="truncate text-base font-semibold">{u.xName || displayName(u)}</span>
            </Link>
            <FollowButton targetUser={u} size="sm" />
          </div>
        ))}
        {status === "idle" && hasMore && (
          <button type="button" onClick={() => void loadMore()} className="btn-ghost mt-1 w-full">
            Show more
          </button>
        )}
      </div>
    </Modal>
  );
}
