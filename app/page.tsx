"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LeaderboardEntry, LeaderboardResponse } from "@/lib/api-types";
import { Avatar, Flag, Pills } from "@/components/ui";
import { CountrySelect } from "@/components/CountrySelect";
import { FollowButton } from "@/components/FollowButton";
import { FollowListModal, type FollowListKind } from "@/components/FollowListModal";
import { LeaderboardHoverCard } from "@/components/LeaderboardHoverCard";
import { useMe } from "@/components/MeProvider";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";
import { applyFollowChange, onFollowChanged } from "@/lib/session-events";

type Range = "7d" | "30d" | "all";
type Metric = "pnl" | "fees" | "volume" | "winrate";

const RANGE_TEXT: Record<Range, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};
const RANGE_SHORT: Record<Range, string> = {
  "7d": "7D",
  "30d": "30D",
  all: "All-time",
};
/** Each metric is its own leaderboard: the API ranks by it, and the cards show only it. */
const METRICS: { value: Metric; label: string; heading: string }[] = [
  { value: "pnl", label: "PnL", heading: "PnL" },
  { value: "fees", label: "Fees", heading: "fees" },
  { value: "volume", label: "Volume", heading: "volume" },
  { value: "winrate", label: "Win rate", heading: "win rate" },
];

function metricValue(e: LeaderboardEntry, m: Metric): string {
  if (m === "fees") return fmtUsd(e.fees);
  if (m === "volume") return fmtUsd(e.volume);
  if (m === "winrate") return fmtPct(e.winRate);
  return fmtUsd(e.pnl, { signed: true });
}

function metricTone(e: LeaderboardEntry, m: Metric): string {
  if (m === "fees") return "text-up";
  if (m !== "pnl" || e.pnl === null) return "text-fg";
  return e.pnl >= 0 ? "text-up" : "text-dn";
}

const profileHref = (e: LeaderboardEntry) => `/profile/${e.xHandle || e.id}`;

interface HoverHandlers {
  /** Show the preview for this entry next to `el` (immediately for keyboard focus). */
  onPreview: (e: LeaderboardEntry, el: HTMLElement, immediate?: boolean) => void;
  onPreviewEnd: () => void;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { wallet, loading: meLoading, user: myUser, userId: sessionUserId, verified } = useMe();
  const [range, setRange] = useState<Range>("30d");
  const [metric, setMetric] = useState<Metric>("pnl");
  const [country, setCountry] = useState<string>("");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // "Following" narrows the whole board server-side (scope=following) to people you follow; signed-in only.
  const [who, setWho] = useState<"all" | "following">("all");
  const followingOnly = verified && who === "following";
  const [hover, setHover] = useState<{ id: number; rect: DOMRect } | null>(null);
  const [followList, setFollowList] = useState<{
    userId: number;
    kind: FollowListKind;
  } | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const myId = sessionUserId ?? myUser?.id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ range, sort: metric });
      if (country) qs.set("country", country);
      if (followingOnly) qs.set("scope", "following");
      const res = await fetch(`/api/leaderboard?${qs.toString()}`, {
        cache: "no-store",
      });
      const result = (await res.json()) as LeaderboardResponse;
      if (!res.ok || !Array.isArray(result.entries)) throw new Error(result.error || "load failed");
      setData(result);
    } catch {
      setData({
        range,
        sort: metric,
        country: country || null,
        entries: [],
        error: "Couldn't load the leaderboard",
      });
    } finally {
      setLoading(false);
    }
  }, [range, metric, country, followingOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // Reload once the connected wallet's stats refresh finishes so a just-synced member appears.
  useEffect(() => {
    if (wallet && !meLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, meLoading]);

  // Follow/unfollow anywhere on the page updates isFollowing + follower counts, and your own following count.
  useEffect(
    () =>
      onFollowChanged((change) =>
        setData((d) =>
          d
            ? {
                ...d,
                entries: d.entries.map((e) => {
                  const next = applyFollowChange(e, change);
                  if (e.id !== sessionUserId || change.viewerFollowingCount === undefined) return next;
                  return {
                    ...next,
                    followingCount: change.viewerFollowingCount,
                  };
                }),
              }
            : d,
        ),
      ),
    [sessionUserId],
  );

  // Hover preview: small delay in, grace period out so the pointer can move onto the card.
  const clearTimers = () => {
    if (showTimer.current) window.clearTimeout(showTimer.current);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    showTimer.current = hideTimer.current = null;
  };
  const hoverHandlers: HoverHandlers = {
    onPreview: (e, el, immediate) => {
      clearTimers();
      const show = () => setHover({ id: e.id, rect: el.getBoundingClientRect() });
      if (immediate) show();
      else showTimer.current = window.setTimeout(show, 180);
    },
    onPreviewEnd: () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      showTimer.current = null;
      hideTimer.current = window.setTimeout(() => setHover(null), 160);
    },
  };
  const keepPreview = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  useEffect(() => {
    if (!hover) return;
    const close = () => setHover(null);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [hover]);
  useEffect(() => () => clearTimers(), []);
  // A different board means different anchors.
  useEffect(() => setHover(null), [range, metric, country, followingOnly]);

  const allEntries = useMemo(() => data?.entries ?? [], [data]);
  // The API already scopes to Following; this only drops someone you just unfollowed without a refetch.
  const entries = useMemo(() => (followingOnly ? allEntries.filter((e) => e.isFollowing !== false) : allEntries), [allEntries, followingOnly]);
  // Only ranked members (with Meteora activity) can take podium spots; unranked ones list last.
  const podium = entries.filter((e) => e.rank !== null).slice(0, 3);
  const rest = entries.filter((e) => !podium.includes(e));
  const mine = myId ? entries.find((e) => e.id === myId) : undefined;
  const isMember = Boolean(verified && myUser?.memberNumber);
  const hovered = hover ? entries.find((e) => e.id === hover.id) : undefined;
  const metricInfo = METRICS.find((m) => m.value === metric) ?? METRICS[0];

  const onCountryChange = (c: string) => {
    setCountry(c);
    const url = new URL(window.location.href);
    if (c) url.searchParams.set("country", c);
    else url.searchParams.delete("country");
    router.push(url.pathname + url.search);
  };

  const n = podium.length;
  const podiumOrder = n === 3 ? [podium[1], podium[0], podium[2]] : n === 2 ? [podium[1], podium[0]] : podium;
  const podiumGrid = n === 3 ? "max-w-[880px] grid-cols-3" : n === 2 ? "max-w-[600px] grid-cols-2" : "max-w-[300px] grid-cols-1";
  // Desktop: two columns read top-to-bottom (4..n/2 | rest) so a long board uses the full width.
  const rowsPerCol = Math.ceil(rest.length / 2);

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]" data-testid="board-heading">
            Top LPs by {metricInfo.heading}
          </h1>
          <p className="mt-1 text-[13px] text-mute">{RANGE_TEXT[range]} · live data from Meteora</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="board-filters">
          <Pills
            value={range}
            onChange={setRange}
            options={[
              { value: "7d", label: "7D" },
              { value: "30d", label: "30D" },
              { value: "all", label: "All" },
            ]}
          />
          <CountrySelect value={country} onChange={onCountryChange} allLabel="Global" membersOnly />
        </div>
      </div>

      {/* Which leaderboard: each metric re-ranks the board server-side. */}
      <div className="mt-5 flex items-end justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label="Leaderboard" className="no-scrollbar flex min-w-0 gap-5 overflow-x-auto sm:gap-6">
          {METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={metric === m.value}
              onClick={() => setMetric(m.value)}
              className={`-mb-px shrink-0 border-b-2 pb-2.5 text-[14px] font-semibold transition ${metric === m.value ? "border-accent text-fg" : "border-transparent text-mute hover:text-fg"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {verified && (
          <button
            type="button"
            aria-pressed={who === "following"}
            onClick={() => setWho((w) => (w === "following" ? "all" : "following"))}
            className={`mb-1.5 h-8 shrink-0 rounded-full border px-3 text-[13px] font-semibold transition ${who === "following" ? "border-border-strong bg-surface-raised text-fg" : "border-border text-mute hover:text-fg"}`}
            data-testid="following-toggle"
          >
            Following
          </button>
        )}
      </div>

      {/* Members who aren't on the board yet (first sync pending). Sign in / join live in the header. */}
      {!loading && isMember && !mine && !followingOnly && (
        <p className="mt-4 text-[13px] text-mute" data-testid="sync-note">
          Your rank shows up after your first sync.{" "}
          <button type="button" onClick={load} className="font-semibold text-fg-secondary hover:text-fg">
            Refresh
          </button>
        </p>
      )}

      {loading && !data ? (
        <div className="mx-auto mt-6 grid max-w-[880px] grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      ) : followingOnly && entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border px-6 py-10 text-center text-[13px] text-mute" data-testid="following-empty">
          You&apos;re not following anyone on this board yet. Hit Follow on an LP to see them here.
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
          <h2 className="text-[18px] font-bold">{country ? "No LPs from here yet" : "No LPs on the board yet"}</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-mute">Members show up here once their Meteora stats sync.</p>
        </div>
      ) : (
        <>
          {n > 0 && (
            <div className={`mx-auto mt-6 grid items-end gap-2 sm:gap-3 ${podiumGrid}`} data-testid="podium">
              {podiumOrder.map((e) => (
                <PodiumCard key={e.id} e={e} first={e === podium[0]} isMe={e.id === myId} metric={metric} {...hoverHandlers} />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <div
              className="mt-5 grid gap-2 lg:grid-flow-col lg:grid-cols-2 lg:gap-x-4"
              style={{
                gridTemplateRows: `repeat(${rowsPerCol}, minmax(0, auto))`,
              }}
              data-testid="rows"
            >
              {rest.map((e) => (
                <Row key={e.id} e={e} isMe={e.id === myId} metric={metric} {...hoverHandlers} />
              ))}
            </div>
          )}
        </>
      )}
      {data?.error && <p className="mt-4 text-[13px] text-dn">{data.error}</p>}

      {hover && hovered && (
        <LeaderboardHoverCard
          entry={hovered}
          anchor={hover.rect}
          rankLabel={hovered.rank !== null ? `#${hovered.rank} by ${metricInfo.heading} · ${RANGE_SHORT[range]}` : "Not ranked yet"}
          isMe={hovered.id === myId}
          onPointerEnter={keepPreview}
          onPointerLeave={hoverHandlers.onPreviewEnd}
          onOpenList={(kind) => {
            setFollowList({ userId: hovered.id, kind });
            setHover(null);
          }}
        />
      )}
      {followList && (
        <FollowListModal
          key={`${followList.userId}-${followList.kind}`}
          userId={followList.userId}
          kind={followList.kind}
          onClose={() => setFollowList(null)}
        />
      )}
    </main>
  );
}

/**
 * Card/row interaction: the whole surface is a profile link drawn as an overlay (not a wrapper, so
 * Follow isn't nested in it). Mouse hover or keyboard focus shows the preview; tap/click opens the profile.
 */
function hoverProps(e: LeaderboardEntry, { onPreview, onPreviewEnd }: HoverHandlers) {
  return {
    container: {
      onPointerEnter: (ev: React.PointerEvent<HTMLDivElement>) => {
        if (ev.pointerType === "mouse") onPreview(e, ev.currentTarget);
      },
      onPointerLeave: (ev: React.PointerEvent<HTMLDivElement>) => {
        if (ev.pointerType === "mouse") onPreviewEnd();
      },
    },
    link: {
      onFocus: (ev: React.FocusEvent<HTMLAnchorElement>) => {
        const box = ev.currentTarget.parentElement;
        if (box && ev.currentTarget.matches(":focus-visible")) onPreview(e, box, true);
      },
      onBlur: () => onPreviewEnd(),
    },
  };
}

function PodiumCard({
  e,
  first,
  isMe,
  metric,
  ...handlers
}: {
  e: LeaderboardEntry;
  first: boolean;
  isMe: boolean;
  metric: Metric;
} & HoverHandlers) {
  const hp = hoverProps(e, handlers);
  const name = displayName(e);
  return (
    <div
      {...hp.container}
      className={`relative flex flex-col items-center rounded-2xl border bg-surface px-2 pb-4 text-center transition sm:px-4 ${first ? "pt-7 sm:pt-9" : "pt-5 sm:pt-6"} ${isMe ? "border-accent" : "border-border hover:border-border-strong"}`}
      data-testid="podium-card"
    >
      <Link href={profileHref(e)} aria-label={`${name}'s profile`} className="absolute inset-0 rounded-2xl" {...hp.link} />
      <span
        className={`pointer-events-none absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border text-[12px] font-bold ${e.rank === 1 ? "border-border-strong bg-surface-raised text-fg" : "border-border bg-surface-raised text-mute"}`}
      >
        {e.rank}
      </span>
      <Avatar user={e} size={first ? 72 : 56} />
      {/* Names wrap instead of truncating on narrow cards. */}
      <div
        className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-1 text-[13px] font-bold leading-tight sm:text-[15px]"
        data-testid="podium-name"
      >
        <span className="max-w-full [overflow-wrap:anywhere]">{name}</span>
        <Flag code={e.country} />
      </div>
      <div
        className={`num mt-1.5 font-extrabold tracking-tight ${first ? "text-[20px] sm:text-[32px]" : "text-[17px] sm:text-[26px]"} ${metricTone(e, metric)}`}
        data-testid="podium-metric"
      >
        {metricValue(e, metric)}
      </div>
      <div className="relative z-10 mt-2.5 h-8">
        {isMe ? <span className="text-[12px] font-semibold leading-8 text-mute">You</span> : <FollowButton targetUser={e} size="sm" />}
      </div>
    </div>
  );
}

function Row({ e, isMe, metric, ...handlers }: { e: LeaderboardEntry; isMe: boolean; metric: Metric } & HoverHandlers) {
  const hp = hoverProps(e, handlers);
  const name = displayName(e);
  return (
    <div
      {...hp.container}
      className={`group relative flex min-w-0 items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 transition sm:px-4 ${isMe ? "border-accent" : "border-border hover:border-border-strong"}`}
      data-testid="board-row"
    >
      <Link href={profileHref(e)} aria-label={`${name}'s profile`} className="absolute inset-0 rounded-xl" {...hp.link} />
      <span className="num w-7 shrink-0 text-center text-[13px] font-bold text-mute" title={e.rank === null ? "No Meteora activity yet" : undefined}>
        {e.rank ?? "–"}
      </span>
      <Avatar user={e} size={36} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] font-semibold sm:text-[15px]">
        <span className="truncate">{name}</span>
        <Flag code={e.country} className="shrink-0" />
        {isMe && <span className="shrink-0 text-[11px] font-semibold text-mute">You</span>}
      </div>
      <div className={`num shrink-0 text-right text-[15px] font-bold sm:text-[16px] ${metricTone(e, metric)}`} data-testid="row-metric">
        {metricValue(e, metric)}
      </div>
      {!isMe && (
        // With a mouse, revealed on row hover / keyboard focus so 30 rows don't read as 30 buttons.
        <div className="relative z-10 hidden shrink-0 transition-opacity sm:block pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
          <FollowButton targetUser={e} size="sm" />
        </div>
      )}
    </div>
  );
}
