"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { LeaderboardEntry, LeaderboardResponse } from "@/lib/api-types";
import { Avatar, Flag, Pills, PoolChip } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { CountrySelect } from "@/components/CountrySelect";
import { FollowButton } from "@/components/FollowButton";
import { useMe } from "@/components/MeProvider";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";
import { applyFollowChange, onFollowChanged, requestSignIn } from "@/lib/session-events";

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
  const { setVisible } = useWalletModal();
  const [view, setView] = useState<"leaderboard" | "countries">("leaderboard");
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
    if (view === "leaderboard") load();
  }, [load, view]);

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

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0">
          {/* View tabs */}
          <div className="mb-4 flex gap-2">
            <Pills
              value={view}
              onChange={(v: "leaderboard" | "countries") => {
                setView(v);
                if (v === "leaderboard") setCountry("");
              }}
              options={[
                { value: "leaderboard", label: "Leaderboard" },
                { value: "countries", label: "Countries" },
              ]}
            />
          </div>

          {view === "leaderboard" ? (
            <>
              {/* Hero */}
              <div className="flex flex-wrap items-end justify-between gap-4">{/* existing hero code */}
            <div>
              <h1 className="text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
                top <span className="brand-text">LPs</span> {HERO_SUFFIX[range]} 🔥
              </h1>
              <p className="mt-1 text-[14px] text-mute">
                Meteora LPs · ranked by {RANGE_LABEL[range]} {SORT_LABEL[sort]} · live data from Meteora
              </p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <div className="text-[12px] text-mute">LPs ranked</div>
                <div className="num text-[22px] font-bold">{data?.stats?.lps ?? "—"}</div>
              </div>
              <div>
                <div className="text-[12px] text-mute">{RANGE_LABEL[range]} LP PnL</div>
                <div className={`num text-[22px] font-bold ${(data?.stats?.totalPnl ?? 0) >= 0 ? "text-up" : "text-dn"}`}>{data?.stats ? fmtUsd(data.stats.totalPnl, { signed: true }) : "—"}</div>
              </div>
              <div className="hidden sm:block">
                <div className="text-[12px] text-mute">Fees earned</div>
                <div className="num text-[22px] font-bold text-orange">{data?.stats ? fmtUsd(data.stats.fees) : "—"}</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="no-scrollbar -mx-4 mt-5 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <Pills value={range} onChange={setRange} options={[{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "all", label: "All" }]} />
            <CountrySelect value={country} onChange={onCountryChange} allLabel="Global" membersOnly />
            <Pills label="Sort" value={sort} onChange={setSort} options={[{ value: "pnl", label: "PnL" }, { value: "volume", label: "Volume" }, { value: "winrate", label: "Win rate" }, { value: "fees", label: "Fees" }]} />
            {verified && (
              <Pills label="Show" value={who} onChange={setWho} options={[{ value: "all", label: "Everyone" }, { value: "following", label: "Following" }]} />
            )}
          </div>

          {/* Claim CTA: connect → sign in → join → first sync. Connecting alone never creates an account. */}
          {!loading && !mine && !followingOnly && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange/25 bg-gradient-to-r from-orange/15 via-pink/10 to-purp/15 px-4 py-3" data-testid="claim-cta">
              <div className="text-[14px]">
                <span className="font-bold">
                  {isMember ? "Syncing your Meteora stats…" : verified ? "Join to claim your rank" : wallet ? "Sign in to claim your rank" : "LP on Meteora?"}
                </span>{" "}
                <span className="text-white/70">
                  {isMember
                    ? "Your rank shows up after the first sync."
                    : verified
                      ? "Join the beta to put your Meteora PnL on the board."
                      : wallet
                        ? "Sign a message to prove it's your wallet. Read-only, no transactions."
                        : "Connect your wallet to claim your rank. Read-only, no transactions."}
                </span>
              </div>
              {isMember ? (
                <button type="button" onClick={load} className="h-9 rounded-full bg-white/[.1] px-4 text-[13px] font-semibold hover:bg-white/[.16]">
                  Refresh
                </button>
              ) : verified ? (
                <Link href="/join" className="flex h-9 items-center rounded-full bg-orange px-4 text-[13px] font-bold shadow-lg shadow-orange/25 hover:bg-orange-soft">
                  Join the beta →
                </Link>
              ) : wallet ? (
                <button type="button" onClick={() => requestSignIn()} className="h-9 rounded-full bg-orange px-4 text-[13px] font-bold shadow-lg shadow-orange/25 hover:bg-orange-soft">
                  Sign in →
                </button>
              ) : (
                <button type="button" onClick={() => setVisible(true)} className="h-9 rounded-full bg-orange px-4 text-[13px] font-bold shadow-lg shadow-orange/25 hover:bg-orange-soft">
                  Claim your rank →
                </button>
              )}
            </div>
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
            <EmptyBoard country={country} onConnect={() => setVisible(true)} connected={Boolean(wallet)} />
          ) : (
            <div className="mt-6 grid grid-cols-3 items-end gap-2 sm:gap-3">
              {[podium[1], podium[0], podium[2]].map((e, idx) =>
                e ? (
                  <PodiumCard key={e.id} e={e} first={idx === 1} isMe={e.id === myId} metric={metric(e)} tone={metricTone(e)} onClick={() => onRow(e)} range={range} />
                ) : (
                  <div key={`empty-${idx}`} className="flex h-44 flex-col items-center justify-center rounded-[26px] border border-dashed border-white/10 text-center text-[12px] text-mute">
                    <span className="text-[22px]">🪑</span>
                    Spot #{idx === 0 ? 2 : 3} is open
                  </div>
                )
              )}
            </div>
          )}

          {/* Rows */}
          {rest.length > 0 && (
            <div className="mt-4 space-y-2">
              {rest.map((e) => (
                <Row key={e.id} e={e} isMe={e.id === myId} metric={metric(e)} tone={metricTone(e)} onClick={() => onRow(e)} range={range} active={selected?.id === e.id} />
              ))}
            </div>
          )}
          {entries.length > 0 && entries.length < 10 && (
            <p className="mt-5 text-center text-[13px] text-mute">
              Early days: {entries.length} LP{entries.length === 1 ? "" : "s"} on the board. Share it with your LP friends and climb together.
            </p>
          )}
          {data?.error && <p className="mt-4 text-[13px] text-dn">{data.error}</p>}
            </>
          ) : (
            <CountriesView range={range} setRange={setRange} onCountryClick={(c) => { setView("leaderboard"); setCountry(c); onCountryChange(c); }} />
          )}
        </section>

        {/* Side profile card */}
        <aside className="hidden lg:block">
          <div className="sticky top-[84px]">
            {selected ? (
              <ProfileCard
                user={selected}
                rank={selected.rank ?? undefined}
                isMe={selected.id === myId}
                stats={{
                  portfolioValue: selected.portfolioValue,
                  totalPnl: selected.totalPnl,
                  rangePnl: selected.pnl,
                  rangeLabel: RANGE_LABEL[range],
                  fees: selected.fees,
                  winRate: selected.winRate,
                  positionsOpen: selected.positionsOpen,
                  positionsClosed: selected.positionsClosed,
                  volume: selected.volume,
                  topPool: selected.topPool,
                }}
              />
            ) : (
              <div className="glass rounded-[28px] p-6 text-center">
                <div className="text-[40px]">🏊</div>
                <h3 className="mt-2 text-[18px] font-bold">Profiles show up here</h3>
                <p className="mt-1 text-[13px] text-mute">Thesis, stats and the PnL calendar for any LP on the board.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function PodiumCard({ e, first, isMe, metric, tone, onClick, range }: { e: LeaderboardEntry; first: boolean; isMe: boolean; metric: string; tone: string; onClick: () => void; range: Range }) {
  const badge = e.rank === 1 ? "bg-orange text-white" : e.rank === 2 ? "bg-[#d9d6e6] text-black" : "bg-[#e0915a] text-black";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onClick();
        }
      }}
      className={`relative flex cursor-pointer flex-col items-center rounded-[26px] px-2 pb-4 text-center transition hover:-translate-y-0.5 sm:px-4 ${first ? "podium-1 pt-6 sm:pt-7" : "glass pt-5"} ${isMe ? "outline outline-2 outline-orange/60" : ""}`}
    >
      <span className={`absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold ${badge}`}>{e.rank}</span>
      {first && <span className="absolute right-3 top-3 hidden rounded-full bg-orange/20 px-2 py-0.5 text-[10px] font-bold text-orange sm:inline">👑 {RANGE_LABEL[range]} #1</span>}
      <Avatar user={e} size={first ? 84 : 64} ring />
      <div className="mt-2 flex max-w-full items-center gap-1 text-[13px] font-bold sm:text-[15px]">
        <span className="truncate">{displayName(e)}</span>
        <Flag code={e.country} />
      </div>
      {isMe && <span className="mt-0.5 rounded-full bg-purp/30 px-2 text-[10px] font-bold text-purp-soft">YOU</span>}
      <div className={`num mt-1 font-extrabold tracking-tight ${first ? "text-[22px] sm:text-[34px]" : "text-[18px] sm:text-[26px]"} ${tone}`}>{metric}</div>
      {!isMe && (
        <div className="mt-2">
          <FollowButton targetUser={e} size="sm" />
        </div>
      )}
      <div className="mt-0.5 hidden text-[11px] text-mute sm:block">
        Vol <span className="text-white/80">{fmtUsd(e.volume)}</span> · Fees <span className="text-orange">{fmtUsd(e.fees)}</span> · Win <span className="text-white/80">{fmtPct(e.winRate)}</span>
      </div>
      <div className="mt-2 max-w-full">
        <PoolChip pool={e.topPool} compact />
      </div>
    </div>
  );
}

function Row({ e, isMe, metric, tone, onClick, range, active }: { e: LeaderboardEntry; isMe: boolean; metric: string; tone: string; onClick: () => void; range: Range; active: boolean }) {
  const share = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText(e, range))}&url=${encodeURIComponent(APP_URL)}`;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") onClick();
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-[20px] px-3 py-2.5 transition sm:px-4 ${isMe ? "you-row" : active ? "glass border-orange/30" : "glass hover:bg-white/[.06]"}`}
    >
      <span className="num w-6 text-center text-[14px] font-bold text-mute" title={e.rank === null ? "No Meteora activity yet" : undefined}>{e.rank ?? "–"}</span>
      <Avatar user={e} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] font-bold">
          <span className="truncate">{displayName(e)}</span>
          <Flag code={e.country} />
          {isMe && <span className="rounded-full bg-orange px-1.5 text-[10px] font-extrabold text-white">YOU</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-mute">
          <PoolChip pool={e.topPool} compact />
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
      <div className="hidden sm:block" onClick={(ev) => ev.stopPropagation()}>
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

function EmptyBoard({ country, onConnect, connected }: { country: string; onConnect: () => void; connected: boolean }) {
  return (
    <div className="glass mt-6 rounded-[28px] px-6 py-12 text-center">
      <div className="text-[46px]">🏊‍♀️</div>
      <h2 className="mt-2 text-[22px] font-extrabold">{country ? "No LPs from here yet" : "The pool is empty. For now."}</h2>
      <p className="mx-auto mt-1 max-w-md text-[14px] text-mute">
        {country ? "Be the first LP to rep this country on the board." : "Connect your wallet to put your Meteora PnL on the board and set the bar."}
      </p>
      {!connected && (
        <button type="button" onClick={onConnect} className="mt-5 h-11 rounded-full bg-orange px-6 text-[14px] font-bold shadow-lg shadow-orange/30 hover:bg-orange-soft">
          Claim the #1 spot →
        </button>
      )}
    </div>
  );
}

interface CountryLeaderboardEntry {
  rank: number;
  country: string;
  name: string;
  members: number;
  totalPnl: number | null;
  totalFees: number | null;
  totalVolume: number | null;
  avgWinRate: number | null;
  topLp: {
    id: number;
    xHandle: string | null;
    xName: string | null;
    xAvatarUrl: string | null;
    anonName: string | null;
    pnl: number | null;
  } | null;
}

interface CountriesResponse {
  range: "7d" | "30d" | "all";
  entries: CountryLeaderboardEntry[];
}

function CountriesView({ range, setRange, onCountryClick }: { range: Range; setRange: (r: Range) => void; onCountryClick: (country: string) => void }) {
  const [data, setData] = useState<CountriesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/countries/leaderboard?range=${range}`)
      .then((r) => r.json() as Promise<CountriesResponse>)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [range]);

  const entries = data?.entries ?? [];

  return (
    <>
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
            country <span className="brand-text">rankings</span> 🌍
          </h1>
          <p className="mt-1 text-[14px] text-mute">
            Countries ranked by combined {RANGE_LABEL[range]} PnL across all members
          </p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="text-[12px] text-mute">Countries</div>
            <div className="num text-[22px] font-bold">{entries.length}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="no-scrollbar -mx-4 mt-5 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Pills value={range} onChange={setRange} options={[{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "all", label: "All" }]} />
      </div>

      {/* Country rows */}
      {loading && !data ? (
        <div className="mt-6 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="glass h-24 animate-pulse rounded-[20px]" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="glass mt-6 rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">🌍</div>
          <h2 className="mt-2 text-[22px] font-extrabold">No country data yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-mute">Waiting for LPs to join and set their country.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {entries.map((entry) => (
            <button
              key={entry.country}
              type="button"
              onClick={() => onCountryClick(entry.country)}
              className="glass flex w-full cursor-pointer items-center gap-4 rounded-[20px] px-4 py-4 text-left transition hover:bg-white/[.06] sm:px-5"
            >
              <span className="num w-8 text-center text-[16px] font-bold text-mute">{entry.rank}</span>
              <Flag code={entry.country} className="!h-[20px] !w-[28px]" />
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-bold">{entry.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-mute">
                  <span>{entry.members} {entry.members === 1 ? "member" : "members"}</span>
                  {entry.topLp && (
                    <span className="flex items-center gap-1">
                      Top LP: <Avatar user={entry.topLp} size={16} /> <span className="text-white/80">{displayName(entry.topLp)}</span>
                    </span>
                  )}
                  <span>Avg win rate: <span className="text-white/80">{fmtPct(entry.avgWinRate, 1)}</span></span>
                </div>
              </div>
              <div className="hidden md:flex md:flex-col md:items-end md:gap-0.5 md:min-w-[90px]">
                <div className="text-[10px] uppercase tracking-wider text-mute">Volume</div>
                <div className="num text-[15px] font-semibold text-white/80">{fmtUsd(entry.totalVolume)}</div>
              </div>
              <div className="hidden sm:flex sm:flex-col sm:items-end sm:gap-0.5 sm:min-w-[90px]">
                <div className="text-[10px] uppercase tracking-wider text-mute">Fees</div>
                <div className="num text-[15px] font-semibold text-orange">{fmtUsd(entry.totalFees)}</div>
              </div>
              <div className={`num text-right text-[22px] font-extrabold sm:text-[28px] ${(entry.totalPnl ?? 0) >= 0 ? "text-up" : "text-dn"}`}>
                {fmtUsd(entry.totalPnl, { signed: true })}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
