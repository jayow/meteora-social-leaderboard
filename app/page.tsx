"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeaderboardEntry, LeaderboardResponse } from "@/lib/api-types";
import { Avatar, Flag, Pills, PoolChip } from "@/components/ui";
import { LeaderboardSideCard } from "@/components/LeaderboardSideCard";
import { CountrySelect } from "@/components/CountrySelect";
import { FollowButton } from "@/components/FollowButton";
import { useMe } from "@/components/MeProvider";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";
import { applyFollowChange, onFollowChanged } from "@/lib/session-events";

type Range = "7d" | "30d" | "all";
type Sort = "pnl" | "volume" | "winrate" | "fees";

const RANGE_LABEL: Record<Range, string> = { "7d": "7D", "30d": "30D", all: "All-time" };
const HERO_SUFFIX: Record<Range, string> = { "7d": "this week", "30d": "this month", all: "of all time" };
const SORT_LABEL: Record<Sort, string> = { pnl: "PnL", volume: "volume", winrate: "win rate", fees: "fees earned" };
const APP_URL = "https://web-production-c8f29.up.railway.app";

function shareText(e: LeaderboardEntry, range: Range): string {
  return `I'm #${e.rank} on Pool Party with ${fmtUsd(e.pnl, { signed: true })} ${RANGE_LABEL[range]} PnL 🏊‍♂️🔥`;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { wallet, loading: meLoading, user: myUser, userId: sessionUserId, verified } = useMe();
  const [range, setRange] = useState<Range>("30d");
  const [sort, setSort] = useState<Sort>("pnl");
  const [country, setCountry] = useState<string>("");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // "Following" narrows the whole board server-side (scope=following) to people you follow; signed-in only.
  const [who, setWho] = useState<"all" | "following">("all");
  const followingOnly = verified && who === "following";

  const myId = sessionUserId ?? myUser?.id;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ range, sort: sort === "fees" ? "pnl" : sort });
      if (country) qs.set("country", country);
      if (followingOnly) qs.set("scope", "following");
      const res = await fetch(`/api/leaderboard?${qs.toString()}`, { cache: "no-store" });
      const result = (await res.json()) as LeaderboardResponse;
      if (!res.ok || !Array.isArray(result.entries)) throw new Error(result.error || "load failed");
      if (sort === "fees") {
        // Members without data (rank null) stay last.
        result.entries = [...result.entries].sort((a, b) => Number(a.rank === null) - Number(b.rank === null) || (b.fees ?? 0) - (a.fees ?? 0));
      }
      setData(result);
    } catch {
      setData({ range, sort, country: country || null, entries: [], stats: null, error: "Couldn't load the leaderboard" });
    } finally {
      setLoading(false);
    }
  }, [range, sort, country, followingOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // Reload once the connected wallet's stats refresh finishes so a just-synced member appears.
  useEffect(() => {
    if (wallet && !meLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, meLoading]);

  // Follow/unfollow anywhere on the page updates isFollowing + follower counts (podium, rows, card),
  // and your own following count.
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
                  return { ...next, followingCount: change.viewerFollowingCount };
                }),
              }
            : d
        )
      ),
    [sessionUserId]
  );

  const allEntries = useMemo(() => data?.entries ?? [], [data]);
  // The API already scopes to Following; this only drops someone you just unfollowed without a refetch.
  const entries = useMemo(() => (followingOnly ? allEntries.filter((e) => e.isFollowing !== false) : allEntries), [allEntries, followingOnly]);
  // Only ranked members (with Meteora activity) can take podium spots; unranked ones list last.
  const podium = entries.filter((e) => e.rank !== null).slice(0, 3);
  const rest = entries.filter((e) => !podium.includes(e));
  const mine = myId ? entries.find((e) => e.id === myId) : undefined;
  const isMember = Boolean(verified && myUser?.memberNumber);
  const selected = entries.find((e) => e.id === selectedId) || mine || entries[0];

  const onRow = (e: LeaderboardEntry) => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) router.push(`/profile/${e.xHandle || e.id}`);
    else setSelectedId(e.id);
  };

  const metric = (e: LeaderboardEntry) => (sort === "volume" ? fmtUsd(e.volume) : sort === "winrate" ? fmtPct(e.winRate) : sort === "fees" ? fmtUsd(e.fees) : fmtUsd(e.pnl, { signed: true }));
  const metricTone = (e: LeaderboardEntry) => (sort === "pnl" ? ((e.pnl ?? 0) >= 0 ? "text-up" : "text-dn") : sort === "fees" ? "text-orange" : "text-white");

  const onCountryChange = (c: string) => {
    setCountry(c);
    const url = new URL(window.location.href);
    if (c) url.searchParams.set("country", c);
    else url.searchParams.delete("country");
    router.push(url.pathname + url.search);
  };

  const n = podium.length;
  const podiumOrder = n === 3 ? [podium[1], podium[0], podium[2]] : n === 2 ? [podium[1], podium[0]] : podium;
  const podiumGrid = n === 3 ? "grid-cols-3" : n === 2 ? "mx-auto max-w-[520px] grid-cols-2" : "mx-auto max-w-[240px] grid-cols-1";

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0">
          {/* Hero */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[36px]">Top LPs {HERO_SUFFIX[range]}</h1>
              <p className="mt-1 text-[13px] text-mute sm:text-[14px]">
                Ranked by {RANGE_LABEL[range]} {SORT_LABEL[sort]} · live data from Meteora
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4 sm:flex sm:shrink-0 sm:gap-6 sm:text-right" data-testid="hero-stats">
              <div>
                <div className="text-[12px] text-mute">LPs ranked</div>
                <div className="num text-[18px] font-bold sm:text-[22px]">{data?.stats?.lps ?? "—"}</div>
              </div>
              <div>
                <div className="text-[12px] text-mute">{RANGE_LABEL[range]} PnL</div>
                <div className={`num text-[18px] font-bold sm:text-[22px] ${(data?.stats?.totalPnl ?? 0) >= 0 ? "text-up" : "text-dn"}`}>{data?.stats ? fmtUsd(data.stats.totalPnl, { signed: true }) : "—"}</div>
              </div>
              <div>
                <div className="text-[12px] text-mute">Fees earned</div>
                <div className="num text-[18px] font-bold sm:text-[22px]">{data?.stats ? fmtUsd(data.stats.fees) : "—"}</div>
              </div>
            </div>
          </div>

          {/* Filters: range pills, country, and one Sort/Show menu. Wraps only on small screens. */}
          <div className="mt-5 flex flex-wrap items-center gap-2 sm:flex-nowrap" data-testid="board-filters">
            <Pills value={range} onChange={setRange} options={[{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "all", label: "All" }]} />
            <CountrySelect value={country} onChange={onCountryChange} allLabel="Global" membersOnly />
            <BoardMenu sort={sort} onSort={setSort} who={followingOnly ? "following" : "all"} onWho={verified ? setWho : null} />
          </div>

          {/* Members who aren't on the board yet (first sync pending). Sign in / join live in the header. */}
          {!loading && isMember && !mine && !followingOnly && (
            <p className="mt-4 text-[13px] text-mute" data-testid="sync-note">
              Your rank shows up after your first sync.{" "}
              <button type="button" onClick={load} className="font-semibold text-white/80 hover:text-white">
                Refresh
              </button>
            </p>
          )}

          {/* Podium */}
          {loading && !data ? (
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass h-56 animate-pulse rounded-[26px]" />
              ))}
            </div>
          ) : followingOnly && entries.length === 0 ? (
            <div className="mt-6 rounded-[26px] border border-dashed border-white/10 px-6 py-10 text-center text-[13px] text-mute" data-testid="following-empty">
              You&apos;re not following anyone on this board yet. Hit Follow on an LP to see them here.
            </div>
          ) : entries.length === 0 ? (
            <div className="glass mt-6 rounded-[28px] px-6 py-10 text-center">
              <h2 className="text-[18px] font-bold">{country ? "No LPs from here yet" : "No LPs on the board yet"}</h2>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-mute">Members show up here once their Meteora stats sync.</p>
            </div>
          ) : (
            n > 0 && (
              <div className={`mt-6 grid items-end gap-2 sm:gap-3 ${podiumGrid}`} data-testid="podium">
                {podiumOrder.map((e) => (
                  <PodiumCard key={e.id} e={e} first={e === podium[0]} isMe={e.id === myId} metric={metric(e)} tone={metricTone(e)} onClick={() => onRow(e)} />
                ))}
              </div>
            )
          )}

          {/* Rows */}
          {rest.length > 0 && (
            <div className="mt-4 space-y-2">
              {rest.map((e) => (
                <Row key={e.id} e={e} isMe={e.id === myId} metric={metric(e)} tone={metricTone(e)} onClick={() => onRow(e)} range={range} active={selected?.id === e.id} />
              ))}
            </div>
          )}
          {data?.error && <p className="mt-4 text-[13px] text-dn">{data.error}</p>}
        </section>

        {/* Side preview: the essentials only; the full profile is one click away. */}
        <aside className="hidden lg:block">
          <div className="sticky top-[84px]">
            {selected ? (
              <LeaderboardSideCard user={selected} rangeLabel={RANGE_LABEL[range]} isMe={selected.id === myId} />
            ) : (
              <div className="glass rounded-[28px] p-6 text-center text-[13px] text-mute">Select an LP to preview them here.</div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "pnl", label: "PnL" },
  { value: "volume", label: "Volume" },
  { value: "winrate", label: "Win rate" },
  { value: "fees", label: "Fees" },
];

/** One small menu for Sort and (signed in) Show: Everyone / Following. Opaque, closes on outside click / Esc. */
function BoardMenu({ sort, onSort, who, onWho }: { sort: Sort; onSort: (s: Sort) => void; who: "all" | "following"; onWho: ((w: "all" | "following") => void) | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "PnL";
  const item = (active: boolean) =>
    `flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] ${active ? "text-white" : "text-mute hover:bg-white/[.06] hover:text-white"}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="glass flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold"
        data-testid="board-menu"
      >
        <span className="text-mute">Sort</span> {sortLabel}
        {who === "following" && <span className="text-mute">· Following</span>}
        <span aria-hidden className="text-[10px] text-mute">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-30 mt-2 w-48 rounded-2xl border border-white/10 bg-[#1A1623] p-1 shadow-xl sm:left-auto sm:right-0">
          <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-mute">Sort by</div>
          {SORT_OPTIONS.map((o) => (
            <button key={o.value} type="button" role="menuitemradio" aria-checked={sort === o.value} onClick={() => { onSort(o.value); setOpen(false); }} className={item(sort === o.value)}>
              {o.label}
              {sort === o.value && <span aria-hidden>✓</span>}
            </button>
          ))}
          {onWho && (
            <>
              <div className="mx-2 my-1 border-t border-white/[.06]" />
              <div className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-mute">Show</div>
              {(["all", "following"] as const).map((w) => (
                <button key={w} type="button" role="menuitemradio" aria-checked={who === w} onClick={() => { onWho(w); setOpen(false); }} className={item(who === w)}>
                  {w === "all" ? "Everyone" : "Following"}
                  {who === w && <span aria-hidden>✓</span>}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PodiumCard({ e, first, isMe, metric, tone, onClick }: { e: LeaderboardEntry; first: boolean; isMe: boolean; metric: string; tone: string; onClick: () => void }) {
  const badge = e.rank === 1 ? "bg-orange text-white" : e.rank === 2 ? "bg-[#d9d6e6] text-black" : "bg-[#e0915a] text-black";
  return (
    <div
      className={`relative flex flex-col items-center rounded-[26px] px-2 pb-4 text-center transition hover:-translate-y-0.5 sm:px-4 ${first ? "podium-1 pt-6 sm:pt-7" : "glass pt-5"} ${isMe ? "outline outline-2 outline-orange/60" : ""}`}
    >
      {/* Whole-card click target as an overlay button (not a wrapper), so Follow / pool links aren't nested in it. */}
      <button type="button" onClick={onClick} aria-label={`Preview ${displayName(e)}`} className="absolute inset-0 rounded-[26px]" />
      <span className={`pointer-events-none absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold ${badge}`}>{e.rank}</span>
      <Avatar user={e} size={first ? 84 : 64} ring />
      {/* Names wrap instead of truncating on narrow podium cards. */}
      <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-1 text-[13px] font-bold leading-tight sm:text-[15px]" data-testid="podium-name">
        <span className="max-w-full [overflow-wrap:anywhere]">{displayName(e)}</span>
        <Flag code={e.country} />
      </div>
      {isMe && <span className="mt-0.5 rounded-full bg-purp/30 px-2 text-[10px] font-bold text-purp-soft">YOU</span>}
      <div className={`num mt-1 font-extrabold tracking-tight ${first ? "text-[22px] sm:text-[34px]" : "text-[18px] sm:text-[26px]"} ${tone}`}>{metric}</div>
      {!isMe && (
        <div className="relative z-10 mt-2">
          <FollowButton targetUser={e} size="sm" />
        </div>
      )}
      <div className="mt-0.5 hidden text-[11px] text-mute sm:block">
        Vol <span className="text-white/80">{fmtUsd(e.volume)}</span> · Fees <span className="text-orange">{fmtUsd(e.fees)}</span> · Win <span className="text-white/80">{fmtPct(e.winRate)}</span>
      </div>
      {/* The chip only fits on wider cards; on phones it would truncate to a stub. */}
      <div className="relative z-10 mt-2 hidden max-w-full sm:block">
        <PoolChip pool={e.topPool} compact />
      </div>
    </div>
  );
}

function Row({ e, isMe, metric, tone, onClick, range, active }: { e: LeaderboardEntry; isMe: boolean; metric: string; tone: string; onClick: () => void; range: Range; active: boolean }) {
  const share = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText(e, range))}&url=${encodeURIComponent(APP_URL)}`;
  return (
    <div
      className={`relative flex items-center gap-3 rounded-[20px] px-3 py-2.5 transition sm:px-4 ${isMe ? "you-row" : active ? "glass border-orange/30" : "glass hover:bg-white/[.06]"}`}
    >
      {/* Row click target as an overlay button, so Follow / Share / pool links aren't nested in it. */}
      <button type="button" onClick={onClick} aria-label={`Preview ${displayName(e)}`} className="absolute inset-0 rounded-[20px]" />
      <span className="num w-6 text-center text-[14px] font-bold text-mute" title={e.rank === null ? "No Meteora activity yet" : undefined}>{e.rank ?? "–"}</span>
      <Avatar user={e} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] font-bold">
          <span className="truncate">{displayName(e)}</span>
          <Flag code={e.country} />
          {isMe && <span className="rounded-full bg-orange px-1.5 text-[10px] font-extrabold text-white">YOU</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-mute">
          <span className="relative z-10 min-w-0">
            <PoolChip pool={e.topPool} compact />
          </span>
          <span>Win {fmtPct(e.winRate)}</span>
        </div>
      </div>
      <div className="hidden md:flex md:flex-col md:items-end md:gap-0.5">
        <div className="text-[10px] uppercase tracking-wider text-mute">Volume</div>
        <div className="num text-[14px] font-semibold text-white/80">{fmtUsd(e.volume)}</div>
      </div>
      <div className="hidden sm:flex sm:flex-col sm:items-end sm:gap-0.5">
        <div className="text-[10px] uppercase tracking-wider text-mute">Fees</div>
        <div className="num text-[14px] font-semibold text-orange">{fmtUsd(e.fees)}</div>
      </div>
      <div className={`num text-right text-[18px] font-extrabold sm:text-[22px] ${tone}`}>{metric}</div>
      <div className="relative z-10 hidden sm:block">
        {isMe && e.rank === null ? null : isMe ? (
          <a href={share} target="_blank" rel="noreferrer" className="h-8 rounded-full bg-white/[.1] px-3.5 text-[13px] font-semibold leading-8 hover:bg-white/[.16]">
            Share
          </a>
        ) : (
          <FollowButton targetUser={e} size="sm" />
        )}
      </div>
    </div>
  );
}
