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
import { CountryBoard } from "@/components/CountryBoard";
import { MEDAL, MedalRing, PODIUM_GRID, PODIUM_STACK_ORDER, PodiumSkeleton, RankMedal, isMedalRank, type MedalRank } from "@/components/RankMedal";
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

const STACK_ORDER = PODIUM_STACK_ORDER;

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
  // Members (people) or Countries (aggregated per country). Following and the country filter only
  // apply to Members, so their controls hide in the Countries view.
  const [view, setView] = useState<"members" | "countries">("members");
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
  useEffect(() => setHover(null), [range, metric, country, followingOnly, view]);

  const allEntries = useMemo(() => data?.entries ?? [], [data]);
  // The API already scopes to Following; this only drops someone you just unfollowed without a refetch.
  const entries = useMemo(() => (followingOnly ? allEntries.filter((e) => e.isFollowing !== false) : allEntries), [allEntries, followingOnly]);
  // The podium is the medal positions: ranks 1-3 of this board (ranks are unique, see the API's
  // row_number tie-break). In Following, ranks stay global, so only followed medalists sit on it and
  // everyone else keeps their rank number in the list.
  const podium = entries
    .filter((e): e is LeaderboardEntry & { rank: MedalRank } => isMedalRank(e.rank))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
  const podiumIds = new Set(podium.map((e) => e.id));
  const rest = entries.filter((e) => !podiumIds.has(e.id));
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
  // Desktop podium order: 2nd, 1st, 3rd (whichever of them are on this board).
  const podiumOrder = [2, 1, 3].flatMap((r) => podium.filter((e) => e.rank === r));
  // Desktop: two columns read top-to-bottom (4..n/2 | rest) so a long board uses the full width.
  // A short list (e.g. Following) stays one centred column under the podium instead of half a grid.
  const twoCols = rest.length >= 6;
  const rowsPerCol = twoCols ? Math.ceil(rest.length / 2) : rest.length;

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]" data-testid="board-heading">
            Top {view === "countries" ? "countries" : "LPs"} by {metricInfo.heading}
          </h1>
          <p className="mt-1 text-[13px] text-mute">{RANGE_TEXT[range]} · live data from Meteora</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="board-filters">
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-1" role="group" aria-label="Rank" data-testid="view-toggle">
            {(["members", "countries"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`h-8 rounded-full px-3.5 text-[13px] font-semibold transition ${view === v ? "bg-surface-raised text-fg" : "text-mute hover:text-fg"}`}
              >
                {v === "members" ? "Members" : "Countries"}
              </button>
            ))}
          </div>
          <Pills
            value={range}
            onChange={setRange}
            options={[
              { value: "7d", label: "7D" },
              { value: "30d", label: "30D" },
              { value: "all", label: "All" },
            ]}
          />
          {view === "members" && <CountrySelect value={country} onChange={onCountryChange} allLabel="Global" membersOnly />}
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
        {verified && view === "members" && (
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
      {view === "members" && !loading && isMember && !mine && !followingOnly && (
        <p className="mt-4 text-[13px] text-mute" data-testid="sync-note">
          Your rank shows up after your first sync.{" "}
          <button type="button" onClick={load} className="font-semibold text-fg-secondary hover:text-fg">
            Refresh
          </button>
        </p>
      )}

      {view === "countries" ? (
        <CountryBoard
          range={range}
          metric={metric}
          metricLabel={metricInfo.label}
          rangeShort={RANGE_SHORT[range]}
          onPick={(code) => {
            onCountryChange(code);
            setView("members");
            window.scrollTo({ top: 0 });
          }}
        />
      ) : loading && !data ? (
        <PodiumSkeleton />
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
            <div className={`mx-auto mt-6 grid gap-2.5 sm:items-end sm:gap-4 ${PODIUM_GRID[n]}`} data-testid="podium">
              {podiumOrder.map((e) => (
                <PodiumCard
                  key={e.id}
                  e={e}
                  rank={e.rank}
                  isMe={e.id === myId}
                  metric={metric}
                  caption={`${metricInfo.label} · ${RANGE_SHORT[range]}`}
                  {...hoverHandlers}
                />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <div
              className={`grid gap-2 ${twoCols ? "lg:grid-flow-col lg:grid-cols-2 lg:gap-x-4" : "mx-auto max-w-[660px]"} ${n > 0 ? "mt-6" : "mt-5"}`}
              style={twoCols ? { gridTemplateRows: `repeat(${rowsPerCol}, minmax(0, auto))` } : undefined}
              data-testid="rows"
            >
              {rest.map((e) => (
                <Row key={e.id} e={e} isMe={e.id === myId} metric={metric} {...hoverHandlers} />
              ))}
            </div>
          )}
        </>
      )}
      {view === "members" && data?.error && <p className="mt-4 text-[13px] text-dn">{data.error}</p>}

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

/**
 * Ranks 1-3. Phones: a full-width row (medal, ringed avatar, name + stat, Follow), stacked 1-2-3.
 * From `sm`: a podium column (2-1-3, #1 tallest) with the medal in the corner.
 */
function PodiumCard({
  e,
  rank,
  isMe,
  metric,
  caption,
  ...handlers
}: {
  e: LeaderboardEntry;
  rank: MedalRank;
  isMe: boolean;
  metric: Metric;
  caption: string;
} & HoverHandlers) {
  const hp = hoverProps(e, handlers);
  const name = displayName(e);
  const first = rank === 1;
  const medal = MEDAL[rank];
  return (
    <div
      {...hp.container}
      className={`relative flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 transition sm:flex-col sm:gap-0 sm:px-5 sm:pb-5 sm:text-center ${medal.card} ${STACK_ORDER[rank]} ${first ? "py-4 sm:pt-10" : "py-3 sm:pt-8"}`}
      data-testid="podium-card"
      data-rank={rank}
    >
      <Link href={profileHref(e)} aria-label={`${name}'s profile`} className="absolute inset-0 rounded-2xl" {...hp.link} />
      <RankMedal rank={rank} size={first ? 30 : 26} className={`pointer-events-none sm:absolute sm:left-4 sm:top-4 ${first ? "sm:h-10 sm:w-[34px]" : "sm:h-8 sm:w-[27px]"}`} />
      <MedalRing rank={rank} className="pointer-events-none">
        {/* Two sizes instead of resizing one <img>; the hidden one is lazy and never loads. */}
        <span className="flex sm:hidden">
          <Avatar user={e} size={first ? 48 : 42} />
        </span>
        <span className="hidden sm:flex">
          <Avatar user={e} size={first ? 96 : 72} />
        </span>
      </MedalRing>
      <div className="pointer-events-none min-w-0 flex-1 sm:mt-3 sm:w-full sm:flex-none">
        <div className={`flex min-w-0 items-center gap-1.5 font-bold leading-tight sm:justify-center ${first ? "text-[15px] sm:text-[19px]" : "text-[15px] sm:text-[16px]"}`} data-testid="podium-name">
          <span className="truncate" title={name}>
            {name}
          </span>
          <Flag code={e.country} className="shrink-0" />
        </div>
        <div
          className={`num mt-0.5 font-extrabold leading-tight tracking-tight sm:mt-2 ${first ? "text-[22px] sm:text-[38px]" : "text-[19px] sm:text-[29px]"} ${metricTone(e, metric)}`}
          data-testid="podium-metric"
        >
          {metricValue(e, metric)}
        </div>
        <div className="mt-0.5 hidden text-[12px] text-mute sm:block">{caption}</div>
      </div>
      <div className="relative z-10 shrink-0 sm:mt-4">
        {isMe ? <span className="px-1 text-[12px] font-semibold text-mute">You</span> : <FollowButton targetUser={e} size="sm" />}
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
