"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { displayName, fmtUsd, timeAgo } from "@/lib/format";
import { meteoraPoolUrl } from "@/lib/meteora-links";
import { onSessionChanged, requestSignIn } from "@/lib/session-events";
import type {
  ActivityFallback,
  ActivityItem,
  ActivityPerson,
  ActivityPool,
  ActivityResponse,
  ActivityScope,
} from "@/lib/activity-types";

const PAGE_SIZE = 25;

function profileHref(p: ActivityPerson): string {
  return `/profile/${p.xHandle || p.id}`;
}

function PersonLink({ person, className = "" }: { person: ActivityPerson; className?: string }) {
  return (
    <Link href={profileHref(person)} className={`font-semibold text-white hover:text-orange ${className}`}>
      {displayName(person)}
    </Link>
  );
}

function TokenDot({ icon, label, className = "" }: { icon: string | null; label: string; className?: string }) {
  if (icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={`h-4 w-4 rounded-full border border-base bg-[#222] object-cover ${className}`} loading="lazy" />;
  }
  return (
    <span className={`flex h-4 w-4 items-center justify-center rounded-full border border-base bg-purp/40 text-[8px] font-bold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

function PoolLink({ pool }: { pool: ActivityPool }) {
  const [x = "?", y = "?"] = pool.name.split("-");
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <Link
        href={`/pools/${pool.address}`}
        className="inline-flex items-center gap-1 rounded-full border border-white/[.08] bg-white/[.04] py-0.5 pl-1 pr-2 text-[12px] font-semibold text-white hover:border-white/20"
        title={`${pool.name}${pool.binStep ? ` · bin step ${pool.binStep}` : ""}`}
      >
        <span className="flex">
          <TokenDot icon={pool.xIcon} label={x} />
          <TokenDot icon={pool.yIcon} label={y} className="-ml-1.5" />
        </span>
        {pool.name}
      </Link>
      <a
        href={meteoraPoolUrl(pool.address, pool.protocol)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-mute hover:text-white"
        title="Open on Meteora"
        aria-label={`Open ${pool.name} on Meteora`}
      >
        ↗
      </a>
    </span>
  );
}

function Action({ item }: { item: ActivityItem }) {
  switch (item.kind) {
    case "joined":
      return <>joined the beta</>;
    case "followed":
      return item.target ? (
        <>
          followed <PersonLink person={item.target} />
        </>
      ) : (
        <>followed someone</>
      );
    case "thesis":
      return (
        <>
          posted a thesis on{" "}
          {item.token ? (
            <Link href={`/pools?token=${encodeURIComponent(item.token.mint)}`} className="font-semibold text-white hover:text-orange">
              {item.token.symbol ? `$${item.token.symbol}` : "a token"}
            </Link>
          ) : (
            "a token"
          )}
        </>
      );
    case "opened":
      return item.pool ? (
        <>
          opened a position in <PoolLink pool={item.pool} />
        </>
      ) : (
        <>opened a position</>
      );
    case "closed":
      return item.pool ? (
        <>
          closed a position in <PoolLink pool={item.pool} />
        </>
      ) : (
        <>closed a position</>
      );
    case "big_win":
      return (
        <>
          closed a position in {item.pool ? <PoolLink pool={item.pool} /> : "a pool"}{" "}
          {item.amountUsd != null && (
            <span className="num rounded-full bg-up/10 px-1.5 py-0.5 text-[11px] font-semibold text-up" title="Realized PnL in this pool">
              {fmtUsd(item.amountUsd, { signed: true })}
            </span>
          )}
        </>
      );
  }
}

function Row({ item }: { item: ActivityItem }) {
  return (
    <li className="flex gap-3 px-4 py-3" data-testid="activity-row" data-kind={item.kind}>
      <Link href={profileHref(item.actor)} className="mt-0.5 shrink-0" aria-label={displayName(item.actor)}>
        <Avatar user={{ id: item.actor.id, xAvatarUrl: item.actor.xAvatarUrl }} size={32} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-[13.5px] leading-6 text-white/70">
            <PersonLink person={item.actor} /> <Action item={item} />
          </p>
          <time dateTime={item.occurredAt} title={new Date(item.occurredAt).toLocaleString()} className="shrink-0 pt-0.5 text-[12px] text-mute">
            {timeAgo(item.occurredAt)}
          </time>
        </div>
        {item.snippet && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-mute">{item.snippet}</p>}
      </div>
    </li>
  );
}

function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <ul className="divide-y divide-white/[.05]" aria-hidden data-testid="activity-loading">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-white/[.06]" />
          <span className="h-3 flex-1 animate-pulse rounded bg-white/[.06]" style={{ maxWidth: `${55 + ((i * 17) % 35)}%` }} />
          <span className="ml-auto h-3 w-10 animate-pulse rounded bg-white/[.05]" />
        </li>
      ))}
    </ul>
  );
}

function ScopeToggle({ value, onChange }: { value: ActivityScope; onChange: (s: ActivityScope) => void }) {
  const opts: { value: ActivityScope; label: string }[] = [
    { value: "following", label: "Following" },
    { value: "everyone", label: "Everyone" },
  ];
  return (
    <div role="tablist" aria-label="Activity scope" className="flex items-center gap-0.5 rounded-full border border-white/[.06] bg-white/[.03] p-0.5 text-[13px] font-semibold">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1 transition ${value === o.value ? "bg-white/[.1] text-white" : "text-mute hover:text-white"}`}
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
      <p className="px-4 py-2.5 text-[12.5px] text-mute" data-testid="activity-fallback">
        <button type="button" onClick={requestSignIn} className="font-semibold text-white hover:text-orange">
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
        <Link href="/" className="font-semibold text-white hover:text-orange">
          Browse the leaderboard
        </Link>{" "}
        to find LPs to follow.
      </p>
    );
  }
  return null;
}

export function ActivityFeed() {
  const [scope, setScope] = useState<ActivityScope>("following");
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [shownScope, setShownScope] = useState<ActivityScope | null>(null);
  const [fallback, setFallback] = useState<ActivityFallback>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const fetchPage = useCallback(async (s: ActivityScope, cursor: string | null): Promise<ActivityResponse> => {
    const qs = new URLSearchParams({ scope: s, limit: String(PAGE_SIZE) });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`/api/activity?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ActivityResponse;
  }, []);

  const loadFirst = useCallback(
    async (s: ActivityScope) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPage(s, null);
        if (id !== reqId.current) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setShownScope(data.scope);
        setFallback(data.fallback);
      } catch {
        if (id !== reqId.current) return;
        setError("Couldn't load activity.");
        setItems([]);
        setNextCursor(null);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    void loadFirst(scope);
  }, [scope, loadFirst]);

  useEffect(() => onSessionChanged(() => void loadFirst(scope)), [scope, loadFirst]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || !shownScope) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const data = await fetchPage(shownScope, nextCursor);
      if (id !== reqId.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...data.items.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(data.nextCursor);
    } catch {
      if (id === reqId.current) setError("Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-[720px] px-4 py-8 lg:px-0">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Activity</h1>
          <p className="mt-0.5 text-[13px] text-mute">Recent moves from Pool Party members.</p>
        </div>
        <ScopeToggle value={scope} onChange={setScope} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[.06] bg-white/[.02]" data-testid="activity-feed">
        {!loading && scope === "following" && shownScope === "everyone" && (
          <div className="border-b border-white/[.05]">
            <FallbackNote fallback={fallback} />
          </div>
        )}

        {loading ? (
          <SkeletonRows />
        ) : error && items.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-mute">
            {error}{" "}
            <button type="button" onClick={() => void loadFirst(scope)} className="font-semibold text-white hover:text-orange">
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center" data-testid="activity-empty">
            <p className="text-[14px] font-semibold text-white">Nothing here yet</p>
            <p className="mt-1 text-[13px] text-mute">
              {shownScope === "following"
                ? "People you follow haven't done anything new yet."
                : "Member activity shows up here as it happens."}
            </p>
            {shownScope === "following" && (
              <button
                type="button"
                onClick={() => setScope("everyone")}
                className="mt-3 rounded-full border border-white/10 px-3 py-1 text-[12.5px] font-semibold text-white/80 hover:bg-white/[.06]"
              >
                See everyone
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-white/[.05]">
            {items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        )}

        {!loading && nextCursor && (
          <div className="border-t border-white/[.05] p-2 text-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="rounded-full px-4 py-1.5 text-[13px] font-semibold text-mute hover:bg-white/[.05] hover:text-white disabled:opacity-60"
              data-testid="activity-more"
            >
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          </div>
        )}
        {error && items.length > 0 && <p className="px-4 pb-3 text-center text-[12px] text-dn">{error}</p>}
      </div>
    </section>
  );
}
