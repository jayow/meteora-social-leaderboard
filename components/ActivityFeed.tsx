"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThesisCard } from "@/components/ThesisCard";
import { Composer } from "@/components/poolside/Composer";
import { EventRun } from "@/components/poolside/EventRows";
import { PositionSharingPrompt } from "@/components/PositionSharing";
import { EmptyState, PageHeader } from "@/components/EmptyState";
import { onSessionChanged, requestSignIn } from "@/lib/session-events";
import type {
  ActivityFallback,
  ActivityItem,
  ActivityResponse,
  ActivityScope,
  FeedFilter,
  FeedItem,
} from "@/lib/activity-types";
import type { ThesisPost } from "@/lib/thesis-types";

const PAGE_SIZE = 25;

type Block = { type: "post"; key: string; post: ThesisPost } | { type: "run"; key: string; items: ActivityItem[] };

/** Posts stay full cards; consecutive events collapse into one compact run. */
function toBlocks(items: FeedItem[]): Block[] {
  const out: Block[] = [];
  for (const it of items) {
    if (it.type === "post") {
      out.push({ type: "post", key: it.key, post: it.post });
    } else {
      const last = out[out.length - 1];
      if (last && last.type === "run") last.items.push(it.event);
      else out.push({ type: "run", key: `run:${it.key}`, items: [it.event] });
    }
  }
  return out;
}

/** Underline tabs (scope) or a segmented toggle (filter); same components as the leaderboard. */
function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex items-end gap-6">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="tab"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FallbackNote({ fallback }: { fallback: ActivityFallback }) {
  if (fallback === "signed_out") {
    return (
      <p className="px-4 py-3 text-base text-mute sm:px-5" data-testid="activity-fallback">
        <button type="button" onClick={requestSignIn} className="link">
          Sign in
        </button>{" "}
        to see people you follow. Showing everyone for now.
      </p>
    );
  }
  if (fallback === "no_follows") {
    return (
      <p className="px-4 py-3 text-base text-mute sm:px-5" data-testid="activity-fallback">
        You&apos;re not following anyone yet, so this shows everyone.{" "}
        <Link href="/" className="link">
          Browse the leaderboard
        </Link>{" "}
        to find LPs to follow.
      </p>
    );
  }
  return null;
}

function Skeleton() {
  return (
    <div aria-hidden data-testid="activity-loading">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex gap-3 border-b border-border px-4 py-4 last:border-b-0">
          <span className="skeleton h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <span className="skeleton block h-3.5 w-40" />
            <span className="skeleton block h-6 w-28 rounded-full" />
            <span className="skeleton block h-3.5 w-full" />
            <span className="skeleton block h-3.5" style={{ width: `${60 + i * 12}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed() {
  const [scope, setScope] = useState<ActivityScope>("everyone");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [shownScope, setShownScope] = useState<ActivityScope | null>(null);
  const [fallback, setFallback] = useState<ActivityFallback>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const fetchPage = useCallback(async (s: ActivityScope, f: FeedFilter, cursor: string | null): Promise<ActivityResponse> => {
    const qs = new URLSearchParams({ scope: s, filter: f, limit: String(PAGE_SIZE) });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`/api/activity?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ActivityResponse;
  }, []);

  const loadFirst = useCallback(
    async (s: ActivityScope, f: FeedFilter) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPage(s, f, null);
        if (id !== reqId.current) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setShownScope(data.scope);
        setFallback(data.fallback);
      } catch {
        if (id !== reqId.current) return;
        setError("Couldn't load Poolside.");
        setItems([]);
        setNextCursor(null);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    void loadFirst(scope, filter);
  }, [scope, filter, loadFirst]);

  useEffect(() => onSessionChanged(() => void loadFirst(scope, filter)), [scope, filter, loadFirst]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || !shownScope) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const data = await fetchPage(shownScope, filter, nextCursor);
      if (id !== reqId.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.key));
        return [...prev, ...data.items.filter((i) => !seen.has(i.key))];
      });
      setNextCursor(data.nextCursor);
    } catch {
      if (id === reqId.current) setError("Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  const onPosted = (post: ThesisPost) => {
    const key = `post:${post.id}`;
    setItems((prev) => [{ type: "post", key, occurredAt: post.createdAt, post }, ...prev.filter((i) => i.key !== key)]);
  };

  const blocks = useMemo(() => toBlocks(items), [items]);

  return (
    <section className="mx-auto w-full max-w-[680px] px-4 pb-10 pt-6 md:px-0">
      <div className="mb-5">
        <PageHeader title="Poolside" />
      </div>

      <Composer onPosted={onPosted} />
      <PositionSharingPrompt className="mt-4" />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-2 border-b border-border">
        <Tabs
          label="Poolside scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: "everyone", label: "Everyone" },
            { value: "following", label: "Following" },
          ]}
        />
        {/* Same underline tabs as the scope, on the same hairline: one control style per row. */}
        <Tabs
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "posts", label: "Posts" },
          ]}
        />
      </div>

      <div className="mt-1" data-testid="activity-feed">
        {!loading && scope === "following" && shownScope === "everyone" && (
          <div className="border-b border-border">
            <FallbackNote fallback={fallback} />
          </div>
        )}

        {loading ? (
          <Skeleton />
        ) : error && items.length === 0 ? (
          <EmptyState
            testId="activity-error"
            title={error}
            action={
              <button type="button" onClick={() => void loadFirst(scope, filter)} className="btn-secondary">
                Try again
              </button>
            }
          />
        ) : items.length === 0 ? (
          <div className="px-6 py-10 text-center" data-testid="activity-empty">
            <p className="text-md font-semibold text-fg">{filter === "posts" ? "No theses yet" : "Nothing here yet"}</p>
            <p className="mx-auto mt-1 max-w-md text-base text-mute">
              {shownScope === "following"
                ? filter === "posts"
                  ? "People you follow haven't posted a thesis yet."
                  : "People you follow haven't posted or done anything new yet."
                : filter === "posts"
                  ? "When LPs share why they're in a pool, it shows up here."
                  : "Theses, follows and badges show up here as they happen, plus opened and closed positions from members who choose to share them."}
            </p>
            {shownScope === "following" && (
              <button type="button" onClick={() => setScope("everyone")} className="btn-secondary mt-4">
                See everyone
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {blocks.map((b) =>
              b.type === "post" ? (
                <div key={b.key} className="py-5">
                  <ThesisCard post={b.post} />
                </div>
              ) : (
                <EventRun key={b.key} items={b.items} />
              )
            )}
          </div>
        )}

        {!loading && nextCursor && (
          <div className="border-t border-border p-2 text-center">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-ghost w-full" data-testid="activity-more">
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          </div>
        )}
        {error && items.length > 0 && <p className="px-4 pb-3 text-center text-base text-dn">{error}</p>}
      </div>
    </section>
  );
}
