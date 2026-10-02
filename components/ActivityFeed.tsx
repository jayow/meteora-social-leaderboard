"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThesisCard } from "@/components/ThesisCard";
import { Composer } from "@/components/poolside/Composer";
import { EventRun } from "@/components/poolside/EventRows";
import { PositionSharingPrompt } from "@/components/PositionSharing";
import { EmptyState, PageHeader } from "@/components/EmptyState";
import { onSessionChanged, requestSignIn } from "@/lib/session-events";
import { EVENT_GROUPS, isEventGroup, type ActivityFallback, type ActivityItem, type ActivityResponse, type ActivityScope, type EventGroup, type FeedItem } from "@/lib/activity-types";
import type { ThesisPost } from "@/lib/thesis-types";

const PAGE_SIZE = 25;

type Tab = "theses" | "activity";

const GROUPS_KEY = "poolside.groups";
const ALL_GROUPS: EventGroup[] = EVENT_GROUPS.map((g) => g.value);

/** "Today", "Yesterday", then "Mon, Sep 29": headers for the Activity list. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function byDay(events: ActivityItem[]): { label: string; items: ActivityItem[] }[] {
  const out: { label: string; items: ActivityItem[] }[] = [];
  for (const e of events) {
    const label = dayLabel(e.occurredAt);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(e);
    else out.push({ label, items: [e] });
  }
  return out;
}

function readGroups(): EventGroup[] {
  try {
    const raw = window.localStorage.getItem(GROUPS_KEY);
    if (!raw) return ALL_GROUPS;
    const list = (JSON.parse(raw) as unknown[]).filter((v): v is EventGroup => typeof v === "string" && isEventGroup(v));
    return list.length ? list : ALL_GROUPS;
  } catch {
    return ALL_GROUPS;
  }
}

/** Underline tabs on the page's one hairline (Theses / Activity). */
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
      <p className="py-3 text-base text-mute" data-testid="activity-fallback">
        <button type="button" onClick={requestSignIn} className="link">
          Sign in
        </button>{" "}
        to see people you follow. Showing everyone for now.
      </p>
    );
  }
  if (fallback === "no_follows") {
    return (
      <p className="py-3 text-base text-mute" data-testid="activity-fallback">
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
        <div key={i} className="flex gap-3 py-5">
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
  const [tab, setTab] = useState<Tab>("theses");
  const [scope, setScope] = useState<ActivityScope>("everyone");
  // Event types the viewer wants in Activity; remembered on this device.
  const [groups, setGroups] = useState<EventGroup[]>(ALL_GROUPS);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [shownScope, setShownScope] = useState<ActivityScope | null>(null);
  const [fallback, setFallback] = useState<ActivityFallback>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  // Something newer than what's on screen exists (see the polling effect below).
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    setGroups(readGroups());
    if (new URLSearchParams(window.location.search).get("tab") === "activity") setTab("activity");
  }, []);

  const toggleGroup = (g: EventGroup) => {
    setGroups((prev) => {
      // Never all off: switching off the last one leaves it on.
      const next = prev.includes(g) ? (prev.length > 1 ? prev.filter((x) => x !== g) : prev) : [...prev, g];
      try {
        window.localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        // per-device convenience only
      }
      return next;
    });
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "activity") url.searchParams.set("tab", "activity");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  const groupsKey = groups.slice().sort().join(",");

  const fetchPage = useCallback(
    async (s: ActivityScope, t: Tab, cursor: string | null): Promise<ActivityResponse> => {
      const qs = new URLSearchParams({ scope: s, filter: t === "theses" ? "posts" : "events", limit: String(PAGE_SIZE) });
      if (t === "activity") qs.set("groups", groupsKey);
      if (cursor) qs.set("cursor", cursor);
      const res = await fetch(`/api/activity?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ActivityResponse;
    },
    [groupsKey]
  );

  const loadFirst = useCallback(
    async (s: ActivityScope, t: Tab) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      setHasNew(false);
      try {
        const data = await fetchPage(s, t, null);
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
    void loadFirst(scope, tab);
  }, [scope, tab, loadFirst]);

  useEffect(() => onSessionChanged(() => void loadFirst(scope, tab)), [scope, tab, loadFirst]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || !shownScope) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const data = await fetchPage(shownScope, tab, nextCursor);
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

  // New-items check: once a minute, only while the page is visible, ask for the newest item's key (a cached
  // one-row lookup) and show a pill if it isn't on screen. Nothing loads until the pill is tapped.
  const shownKeys = useRef(new Set<string>());
  shownKeys.current = new Set(items.map((i) => i.key));
  useEffect(() => {
    if (loading || error) return;
    let stopped = false;
    let last = Date.now();
    const check = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      last = Date.now();
      const qs = new URLSearchParams({ scope, filter: tab === "theses" ? "posts" : "events" });
      if (tab === "activity") qs.set("groups", groupsKey);
      try {
        const res = await fetch(`/api/activity/latest?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { newest: string | null };
        if (!stopped && data.newest && !shownKeys.current.has(data.newest)) setHasNew(true);
      } catch {
        // Offline or the server is busy: try again next minute.
      }
    };
    const timer = window.setInterval(() => void check(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 60_000) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loading, error, scope, tab, groupsKey]);

  const showNew = () => {
    setHasNew(false);
    void loadFirst(scope, tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onPosted = (post: ThesisPost) => {
    if (tab !== "theses") return;
    const key = `post:${post.id}`;
    setItems((prev) => [{ type: "post", key, occurredAt: post.createdAt, post }, ...prev.filter((i) => i.key !== key)]);
  };

  const posts = useMemo(() => items.flatMap((i) => (i.type === "post" ? [i.post] : [])), [items]);
  const days = useMemo(() => byDay(items.flatMap((i) => (i.type === "event" ? [i.event] : []))), [items]);

  const empty =
    tab === "theses"
      ? {
          title: "No LP ideas yet",
          body: shownScope === "following" ? "People you follow haven't posted an LP idea yet." : "When LPs share why they're in a pool, it shows up here.",
        }
      : {
          title: "Nothing here yet",
          body:
            shownScope === "following"
              ? "No activity from people you follow with these filters."
              : "Trades, follows, joins and badges show up here as they happen. Trades only appear for members who share them.",
        };

  return (
    <section className="mx-auto w-full max-w-[680px] px-4 pb-10 pt-6 md:px-0">
      <PageHeader title="Poolside" />

      {/* Two views: Theses (posts) and Activity (what members do). Everyone / Following applies to both. */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border">
        <Tabs
          label="Poolside view"
          value={tab}
          onChange={switchTab}
          options={[
            { value: "theses", label: "LP ideas" },
            { value: "activity", label: "Activity" },
          ]}
        />
        <div className="tgl pb-2" role="group" aria-label="Whose posts">
          {(["everyone", "following"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={scope === v} onClick={() => setScope(v)} className="tgl-item">
              {v === "everyone" ? "Everyone" : "Following"}
            </button>
          ))}
        </div>
      </div>

      {tab === "theses" ? (
        <div className="mt-5">
          <Composer onPosted={onPosted} />
        </div>
      ) : (
        <>
          <PositionSharingPrompt className="mt-5" />
          {/* What to show: each type switches on and off; at least one stays on. */}
          <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Show activity types" data-testid="activity-filters">
            {EVENT_GROUPS.map((g) => {
              const on = groups.includes(g.value);
              return (
                <button
                  key={g.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleGroup(g.value)}
                  className={`h-7 rounded-full border px-3 text-sm font-semibold transition ${
                    on ? "border-accent/50 bg-accent-tint text-fg" : "border-border text-mute hover:border-border-strong hover:text-fg"
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {hasNew && (
        // Stays in view while scrolling, just under the header.
        <div className="pointer-events-none sticky top-[72px] z-20 flex justify-center">
          <button
            type="button"
            onClick={showNew}
            className="pointer-events-auto mt-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-accent/50 bg-accent-tint px-4 text-sm font-semibold text-fg shadow-lg shadow-black/40 transition hover:border-accent"
            data-testid="feed-new-items"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 13V3M4 7l4-4 4 4" />
            </svg>
            {tab === "theses" ? "New LP ideas" : "New activity"}
          </button>
        </div>
      )}

      <div className="mt-2" data-testid="activity-feed">
        {!loading && scope === "following" && shownScope === "everyone" && <FallbackNote fallback={fallback} />}

        {loading ? (
          <Skeleton />
        ) : error && items.length === 0 ? (
          <EmptyState
            testId="activity-error"
            title={error}
            action={
              <button type="button" onClick={() => void loadFirst(scope, tab)} className="btn-secondary">
                Try again
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            testId="activity-empty"
            title={empty.title}
            action={
              shownScope === "following" ? (
                <button type="button" onClick={() => setScope("everyone")} className="btn-secondary">
                  See everyone
                </button>
              ) : undefined
            }
          >
            {empty.body}
          </EmptyState>
        ) : tab === "theses" ? (
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <div key={post.id} className="py-5">
                <ThesisCard post={post} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5 pt-3">
            {days.map((d) => (
              <div key={d.label}>
                <h3 className="text-sm font-medium text-mute">{d.label}</h3>
                <EventRun items={d.items} />
              </div>
            ))}
          </div>
        )}

        {!loading && nextCursor && (
          <div className="pt-2 text-center">
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
