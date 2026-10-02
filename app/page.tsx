"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { LeaderboardEntry, LeaderboardResponse } from "@/lib/api-types";
import { Avatar, Flag } from "@/components/ui";
import { CountrySelect } from "@/components/CountrySelect";
import { FollowButton } from "@/components/FollowButton";
import { FollowListModal, type FollowListKind } from "@/components/FollowListModal";
import { LeaderboardHoverCard } from "@/components/LeaderboardHoverCard";
import { CountryBoard } from "@/components/CountryBoard";
import { LIST_ROW, MedalPin, MedalRing, PODIUM_GRID, PODIUM_LIFT, PODIUM_SLOT, PODIUM_STACK_ORDER, PODIUM_WRAP, PodiumSkeleton, isMedalRank, listWrap, type MedalRank } from "@/components/RankMedal";
import { useMe } from "@/components/MeProvider";
import { EmptyState, PageHeader } from "@/components/EmptyState";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";
import { applyFollowChange, onFollowChanged } from "@/lib/session-events";
import { isCountryCode } from "@/lib/countries";

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

/** How the preview was opened: mouse hover, keyboard focus, or a touch long-press. */
type PreviewMode = "mouse" | "keyboard" | "touch";
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP = 10;

interface HoverHandlers {
  /** Show the preview for this entry next to `box` (mouse waits a beat; keyboard/touch are immediate). */
  onPreview: (e: LeaderboardEntry, box: HTMLElement, mode: PreviewMode, link?: HTMLAnchorElement | null) => void;
  onPreviewEnd: () => void;
  /** Keyboard: Tab from a card's link moves into its open preview. True when handled. */
  onEnterPreview: (e: LeaderboardEntry) => boolean;
  /** A long-press just opened a preview: swallow the click that follows the finger lifting. */
  consumeClick: () => boolean;
  /** Long-press bookkeeping (one touch at a time). */
  press: React.MutableRefObject<{ timer: number; x: number; y: number } | null>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

// useSearchParams needs a Suspense boundary for the static build; the fallback mirrors the loading state.
export default function LeaderboardPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
          <PodiumSkeleton />
        </main>
      }
    >
      <LeaderboardBoard />
    </Suspense>
  );
}

function LeaderboardBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { wallet, loading: meLoading, user: myUser, userId: sessionUserId, verified } = useMe();
  const [range, setRange] = useState<Range>("30d");
  const [metric, setMetric] = useState<Metric>("pnl");
  // View and country filter live in the URL (?view=countries, ?country=XX): shareable, and back/forward work.
  const countryParam = (searchParams.get("country") || "").toUpperCase();
  const country = isCountryCode(countryParam) ? countryParam : "";
  const view: "members" | "countries" = searchParams.get("view") === "countries" ? "countries" : "members";
  const setUrl = useCallback(
    (next: { view?: "members" | "countries"; country?: string }) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next.view !== undefined) {
        if (next.view === "countries") p.set("view", "countries");
        else p.delete("view");
      }
      if (next.country !== undefined) {
        if (next.country) p.set("country", next.country);
        else p.delete("country");
      }
      const qs = p.toString();
      router.push(qs ? `/?${qs}` : "/", { scroll: false });
    },
    [router, searchParams],
  );
  const setView = (v: "members" | "countries") => setUrl({ view: v });
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // "Following" narrows the whole board server-side (scope=following) to people you follow; signed-in only.
  const [who, setWho] = useState<"all" | "following">("all");
  // Members (people) or Countries (aggregated per country) comes from the URL above. Following and
  // the country filter only apply to Members, so their controls hide in the Countries view.
  const followingOnly = verified && who === "following";
  const [hover, setHover] = useState<{ id: number; rect: DOMRect; mode: PreviewMode; link: HTMLAnchorElement | null } | null>(null);
  const press = useRef<{ timer: number; x: number; y: number } | null>(null);
  const swallowClickUntil = useRef(0);
  const skipFocusOpen = useRef(false);
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
    onPreview: (e, box, mode, link = null) => {
      if (mode === "keyboard" && skipFocusOpen.current) {
        skipFocusOpen.current = false;
        return;
      }
      clearTimers();
      const show = () => setHover({ id: e.id, rect: box.getBoundingClientRect(), mode, link });
      if (mode === "mouse") showTimer.current = window.setTimeout(show, 180);
      else show();
      if (mode === "touch") swallowClickUntil.current = Date.now() + 1000;
    },
    onPreviewEnd: () => {
      if (showTimer.current) window.clearTimeout(showTimer.current);
      showTimer.current = null;
      // A touch preview stays until tap outside / Esc.
      if (hover?.mode === "touch") return;
      hideTimer.current = window.setTimeout(() => setHover(null), 160);
    },
    onEnterPreview: (e) => {
      if (hover?.id !== e.id || hover.mode !== "keyboard") return false;
      const first = document.querySelector<HTMLElement>(`[data-testid="hover-card"] :is(${FOCUSABLE})`);
      if (!first) return false;
      keepPreview();
      first.focus();
      return true;
    },
    consumeClick: () => {
      if (Date.now() > swallowClickUntil.current) return false;
      swallowClickUntil.current = 0;
      return true;
    },
    press,
  };
  const closePreview = () => {
    clearTimers();
    setHover(null);
  };
  // Keyboard out of the preview: forward to whatever follows the card's link (closes it), back to the link
  // itself (its focus re-opens the preview, so Tab / Shift+Tab can go in and out).
  const leavePreview = (dir: "forward" | "back") => {
    const link = hover?.link;
    closePreview();
    if (!link) return;
    if (dir === "back") {
      link.focus();
      return;
    }
    const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest('[data-testid="hover-card"]'));
    const next = all[all.indexOf(link) + 1];
    (next ?? link).focus();
  };
  const keepPreview = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };
  useEffect(() => {
    if (!hover) return;
    const close = () => setHover(null);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      // Esc from inside the preview returns focus to the card it belongs to.
      const fromInside = Boolean(document.activeElement?.closest('[data-testid="hover-card"]'));
      close();
      if (fromInside && hover.link) {
        skipFocusOpen.current = true;
        hover.link.focus();
      }
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

  const onCountryChange = (c: string) => setUrl({ country: c });

  const n = podium.length;
  // Desktop podium order: 2nd, 1st, 3rd (whichever of them are on this board).
  const podiumOrder = [2, 1, 3].flatMap((r) => podium.filter((e) => e.rank === r));
  // Desktop: two columns read top-to-bottom (4..n/2 | rest) so a long board uses the full width.
  // A short list (e.g. Following) stays one centred column under the podium instead of half a grid.
  const twoCols = rest.length >= 6;
  const rowsPerCol = twoCols ? Math.ceil(rest.length / 2) : rest.length;

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <PageHeader
        testId="board-heading"
        title={<>Top {view === "countries" ? "countries" : "LPs"} by {metricInfo.heading}</>}
        description={`${RANGE_TEXT[range]} · live data from Meteora`}
      >
        {/* Phones: the Members / Countries switch gets its own full-width row; range + country share the
            next one (the country name truncates). From sm everything sits on one line. */}
        {/* Plain text controls, no pill groups: which board, which range, which country. */}
        <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 sm:w-auto sm:flex-nowrap" data-testid="board-filters">
          <div className="tgl" role="group" aria-label="Rank" data-testid="view-toggle">
            {(["members", "countries"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className="tgl-item">
                {v === "members" ? "Members" : "Countries"}
              </button>
            ))}
          </div>
          <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
          <div className="tgl" role="group" aria-label="Range">
            {(
              [
                { value: "7d", label: "7D" },
                { value: "30d", label: "30D" },
                { value: "all", label: "All" },
              ] as const
            ).map((o) => (
              <button key={o.value} type="button" aria-pressed={range === o.value} onClick={() => setRange(o.value)} className="tgl-item">
                {o.label}
              </button>
            ))}
          </div>
          {view === "members" && (
            <>
              <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
              <CountrySelect value={country} onChange={onCountryChange} allLabel="Global" membersOnly plain className="min-w-0 max-w-[200px]" />
            </>
          )}
        </div>
      </PageHeader>

      {/* Which leaderboard: each metric re-ranks the board server-side. */}
      <div className="mt-6 flex items-end justify-between gap-3 border-b border-border">
        <div role="tablist" aria-label="Leaderboard" className="no-scrollbar flex min-w-0 gap-6 overflow-x-auto">
          {METRICS.map((m) => (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={metric === m.value}
              onClick={() => setMetric(m.value)}
              className="tab shrink-0"
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
            className="group mb-2 flex h-7 shrink-0 items-center gap-2 rounded-tag text-base font-semibold text-mute transition hover:text-fg aria-pressed:text-fg"
            data-testid="following-toggle"
          >
            {/* A small check box rather than a pill: it filters the board, it isn't another tab. */}
            <span
              className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition ${
                who === "following" ? "border-accent bg-accent text-accent-fg" : "border-border-strong group-hover:border-mute"
              }`}
              aria-hidden="true"
            >
              {who === "following" && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.2l2.2 2.3 4.8-5" />
                </svg>
              )}
            </span>
            Following
          </button>
        )}
      </div>

      {/* Members who aren't on the board yet (first sync pending). Sign in / join live in the header. */}
      {view === "members" && !loading && isMember && !mine && !followingOnly && (
        <p className="mt-4 text-base text-mute" data-testid="sync-note">
          Your rank shows up after your first sync.{" "}
          <button type="button" onClick={load} className="link">
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
            // One history entry, so Back returns to the Countries view.
            setUrl({ view: "members", country: code });
            window.scrollTo({ top: 0 });
          }}
        />
      ) : loading && !data ? (
        <PodiumSkeleton />
      ) : followingOnly && entries.length === 0 ? (
        <EmptyState className="mt-6" testId="following-empty" title="No one you follow is on this board">
          Hit Follow on an LP to see them here.
        </EmptyState>
      ) : entries.length === 0 ? (
        <EmptyState className="mt-6" title={country ? "No LPs from here yet" : "No LPs on the board yet"}>
          Members show up here once their Meteora stats sync.
        </EmptyState>
      ) : (
        <>
          {n > 0 && (
            <div className={`${PODIUM_WRAP} ${PODIUM_GRID[n]}`} data-testid="podium">
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
              className={listWrap(twoCols, n > 0)}
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
      {view === "members" && data?.error && <p className="mt-4 text-base text-dn">{data.error}</p>}

      {hover && hovered && (
        <LeaderboardHoverCard
          entry={hovered}
          anchor={hover.rect}
          rankLabel={hovered.rank !== null ? `#${hovered.rank} by ${metricInfo.heading} · ${RANGE_SHORT[range]}` : "Not ranked yet"}
          isMe={hovered.id === myId}
          mode={hover.mode}
          onPointerEnter={keepPreview}
          onPointerLeave={(ev) => {
            if (ev.pointerType === "mouse") hoverHandlers.onPreviewEnd();
          }}
          onFocusInside={keepPreview}
          onFocusOutside={closePreview}
          onKeyboardExit={leavePreview}
          onDismiss={() => {
            if (!hoverHandlers.consumeClick()) closePreview();
          }}
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
 * Follow isn't nested in it). Tap/click opens the profile. The preview opens on mouse hover, on
 * keyboard focus (Tab then moves into it), or on a ~450ms touch long-press (the click that follows is
 * swallowed; the native callout/menu and text selection are suppressed on touch).
 */
function hoverProps(e: LeaderboardEntry, h: HoverHandlers) {
  const cancelPress = () => {
    if (h.press.current) window.clearTimeout(h.press.current.timer);
    h.press.current = null;
  };
  return {
    container: {
      onPointerEnter: (ev: React.PointerEvent<HTMLDivElement>) => {
        if (ev.pointerType === "mouse") h.onPreview(e, ev.currentTarget, "mouse");
      },
      onPointerLeave: (ev: React.PointerEvent<HTMLDivElement>) => {
        if (ev.pointerType === "mouse") h.onPreviewEnd();
      },
      onPointerDown: (ev: React.PointerEvent<HTMLDivElement>) => {
        if (ev.pointerType === "mouse" || (ev.target as HTMLElement).closest("button")) return;
        cancelPress();
        const box = ev.currentTarget;
        const link = box.querySelector<HTMLAnchorElement>(":scope > a");
        h.press.current = {
          x: ev.clientX,
          y: ev.clientY,
          timer: window.setTimeout(() => {
            h.press.current = null;
            h.onPreview(e, box, "touch", link);
          }, LONG_PRESS_MS),
        };
      },
      onPointerMove: (ev: React.PointerEvent<HTMLDivElement>) => {
        const p = h.press.current;
        if (p && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > LONG_PRESS_SLOP) cancelPress();
      },
      onPointerUp: cancelPress,
      onPointerCancel: cancelPress,
      // Long-press on a link would open the browser's context menu / link preview.
      onContextMenu: (ev: React.MouseEvent<HTMLDivElement>) => {
        if (window.matchMedia("(pointer: coarse)").matches) ev.preventDefault();
      },
    },
    link: {
      onFocus: (ev: React.FocusEvent<HTMLAnchorElement>) => {
        const box = ev.currentTarget.parentElement;
        if (box && ev.currentTarget.matches(":focus-visible")) h.onPreview(e, box, "keyboard", ev.currentTarget);
      },
      onBlur: () => h.onPreviewEnd(),
      onKeyDown: (ev: React.KeyboardEvent<HTMLAnchorElement>) => {
        if (ev.key === "Tab" && !ev.shiftKey && h.onEnterPreview(e)) ev.preventDefault();
      },
      onClick: (ev: React.MouseEvent<HTMLAnchorElement>) => {
        if (h.consumeClick()) ev.preventDefault();
      },
    },
  };
}

/** Touch: no callout, no accidental text selection while holding a card. */
const TOUCH_SAFE = "[-webkit-touch-callout:none] pointer-coarse:select-none";

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
  return (
    <div {...hp.container} className={`${PODIUM_SLOT} ${TOUCH_SAFE} ${STACK_ORDER[rank]} ${PODIUM_LIFT[rank]}`} data-testid="podium-card" data-rank={rank}>
      <Link href={profileHref(e)} aria-label={`${name}'s profile`} className="absolute inset-0 sm:rounded-card" {...hp.link} />
      <span className="pointer-events-none relative shrink-0">
        <MedalRing rank={rank}>
          {/* Two sizes instead of resizing one <img>; the hidden one is lazy and never loads. */}
          <span className="flex sm:hidden">
            <Avatar user={e} size={first ? 48 : 42} />
          </span>
          <span className="hidden sm:flex">
            <Avatar user={e} size={first ? 112 : 84} />
          </span>
        </MedalRing>
        <MedalPin rank={rank} first={first} />
      </span>
      <div className="pointer-events-none min-w-0 flex-1 sm:mt-6 sm:w-full sm:flex-none">
        <div className={`flex min-w-0 items-center gap-1.5 font-semibold sm:justify-center ${first ? "text-md sm:text-lg" : "text-md"}`} data-testid="podium-name">
          <span className="truncate" title={name}>
            {name}
          </span>
          <Flag code={e.country} className="shrink-0" />
          {isMe && <span className="chip">You</span>}
        </div>
        <div
          className={`num mt-0.5 font-bold tracking-tight sm:mt-1.5 ${first ? "text-xl sm:text-3xl" : "text-xl sm:text-2xl"} ${metricTone(e, metric)}`}
          data-testid="podium-metric"
        >
          {metricValue(e, metric)}
        </div>
        <div className="mt-1 hidden text-sm text-mute sm:block">{caption}</div>
      </div>
      {!isMe && (
        <div className="relative z-10 shrink-0 sm:mt-4">
          <FollowButton targetUser={e} size="sm" />
        </div>
      )}
    </div>
  );
}

function Row({ e, isMe, metric, ...handlers }: { e: LeaderboardEntry; isMe: boolean; metric: Metric } & HoverHandlers) {
  const hp = hoverProps(e, handlers);
  const name = displayName(e);
  return (
    <div
      {...hp.container}
      className={`${LIST_ROW} ${TOUCH_SAFE} ${
        // Your own row: a quiet surface and a thin accent bar on the left, plus the "You" chip.
        isMe ? "bg-surface before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent" : ""
      }`}
      data-testid="board-row"
    >
      <Link href={profileHref(e)} aria-label={`${name}'s profile`} className="absolute inset-0" {...hp.link} />
      <span className="num w-6 shrink-0 text-right text-sm text-mute" title={e.rank === null ? "No Meteora activity yet" : undefined}>
        {e.rank ?? "–"}
      </span>
      <Avatar user={e} size={32} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-md font-medium text-fg">
        <span className="truncate">{name}</span>
        <Flag code={e.country} className="shrink-0" />
        {isMe && <span className="chip">You</span>}
      </div>
      {!isMe && (
        // With a mouse, revealed on row hover / keyboard focus so 30 rows don't read as 30 buttons.
        <div className="relative z-10 hidden shrink-0 transition-opacity sm:block pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
          <FollowButton targetUser={e} size="sm" />
        </div>
      )}
      <div className={`num shrink-0 text-right text-md font-bold ${metricTone(e, metric)}`} data-testid="row-metric">
        {metricValue(e, metric)}
      </div>
    </div>
  );
}
