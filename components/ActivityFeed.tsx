"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThesisCard } from "@/components/ThesisCard";
import { Composer } from "@/components/poolside/Composer";
import { EventRun } from "@/components/poolside/EventRows";
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

function Tabs<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; size?: "md" | "sm" }) {
  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative rounded-full font-semibold transition ${size === "md" ? "h-9 px-3.5 text-[14px]" : "h-7 px-2.5 text-[12.5px]"} ${
              active ? "bg-surface-raised text-fg" : "text-mute hover:text-fg"
            }`}
          >
            {o.label}
            {active && size === "md" && <span className="absolute inset-x-3.5 -bottom-[7px] h-0.5 rounded-full bg-accent" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

function FallbackNote({ fallback }: { fallback: ActivityFallback }) {
  if (fallback === "signed_out") {
    return (
      <p className="px-4 py-2.5 text-[12.5px] text-mute" data-testid="activity-fallback">
        <button type="button" onClick={requestSignIn} className="font-semibold text-fg hover:underline">
          Sign in
        </button>{" "}
        to see people you follow. Showing everyone for now.
      </p>
    );
  }
  if (fallback === "no_follows") {
    return (
      <p className="px-4 py-2.5 text-[12.5px] text-mute" data-testid="activity-fallback">
        You&apos;re not following anyone yet, so this shows everyone.{" "}
        <Link href="/" className="font-semibold text-fg hover:underline">
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
          <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-raised" />
          <div className="flex-1 space-y-2">
            <span className="block h-3 w-40 animate-pulse rounded bg-surface-raised" />
            <span className="block h-5 w-24 animate-pulse rounded-full bg-surface-raised" />
            <span className="block h-3 w-full animate-pulse rounded bg-surface-raised" />
            <span className="block h-3 animate-pulse rounded bg-surface-raised" style={{ width: `${60 + i * 12}%` }} />
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
    <section className="mx-auto w-full max-w-[680px] px-4 py-8 md:px-0">
      <div className="mb-4">
        <h1 className="text-[22px] font-bold tracking-tight">Poolside</h1>
        <p className="mt-0.5 text-[13px] text-mute">Theses from LPs on the pools they&apos;re in, plus what members are up to.</p>
      </div>

      <Composer onPosted={onPosted} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5">
        <Tabs
          label="Poolside scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: "everyone", label: "Everyone" },
            { value: "following", label: "Following" },
          ]}
        />
        <Tabs
          label="Show"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "posts", label: "Posts" },
          ]}
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface" data-testid="activity-feed">
        {!loading && scope === "following" && shownScope === "everyone" && (
          <div className="border-b border-border">
            <FallbackNote fallback={fallback} />
          </div>
        )}

        {loading ? (
          <Skeleton />
        ) : error && items.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-mute" data-testid="activity-error">
            {error}{" "}
            <button type="button" onClick={() => void loadFirst(scope, filter)} className="font-semibold text-fg hover:underline">
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center" data-testid="activity-empty">
            <p className="text-[14px] font-semibold text-fg">{filter === "posts" ? "No theses yet" : "Nothing here yet"}</p>
            <p className="mx-auto mt-1 max-w-[380px] text-[13px] text-mute">
              {shownScope === "following"
                ? "People you follow haven't posted or done anything new yet."
                : filter === "posts"
                  ? "When LPs share why they're in a pool, it shows up here."
                  : "Theses and member activity show up here as they happen."}
            </p>
            {shownScope === "following" && (
              <button type="button" onClick={() => setScope("everyone")} className="btn-secondary mt-3 h-8 px-3 text-[12.5px]">
                See everyone
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {blocks.map((b) =>
              b.type === "post" ? (
                <div key={b.key} className="px-4 py-4">
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
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-ghost h-8 px-4 text-[13px]" data-testid="activity-more">
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          </div>
        )}
        {error && items.length > 0 && <p className="px-4 pb-3 text-center text-[12px] text-dn">{error}</p>}
      </div>
    </section>
  );
}
