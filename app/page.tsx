"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { LeaderboardEntry, LeaderboardResponse } from "@/lib/api-types";
import { Avatar, Flag, Pills, PoolChip } from "@/components/ui";
import { ProfileCard } from "@/components/ProfileCard";
import { CountrySelect } from "@/components/CountrySelect";
import { useMe } from "@/components/MeProvider";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";

type Range = "7d" | "30d" | "all";
type Sort = "pnl" | "volume" | "winrate";

const RANGE_LABEL: Record<Range, string> = { "7d": "7D", "30d": "30D", all: "All-time" };
const HERO_SUFFIX: Record<Range, string> = { "7d": "this week", "30d": "this month", all: "of all time" };
const SORT_LABEL: Record<Sort, string> = { pnl: "PnL", volume: "volume", winrate: "win rate" };
const APP_URL = "https://web-production-c8f29.up.railway.app";

function shareText(e: LeaderboardEntry, range: Range): string {
  return `I'm #${e.rank} on Pool Party, the Meteora LP leaderboard, with ${fmtUsd(e.pnl, { signed: true })} ${RANGE_LABEL[range]} PnL 🏊‍♂️🔥`;
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { wallet, loading: meLoading } = useMe();
  const { setVisible } = useWalletModal();
  const [range, setRange] = useState<Range>("30d");
  const [sort, setSort] = useState<Sort>("pnl");
  const [country, setCountry] = useState<string>("");
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ range, sort });
      if (country) qs.set("country", country);
      const res = await fetch(`/api/leaderboard?${qs.toString()}`, { cache: "no-store" });
      setData((await res.json()) as LeaderboardResponse);
    } catch {
      setData({ range, sort, country: country || null, entries: [], stats: null, error: "Couldn't load the leaderboard" });
    } finally {
      setLoading(false);
    }
  }, [range, sort, country]);

  useEffect(() => {
    load();
  }, [load]);

  // Reload once registration finishes so a freshly connected wallet appears.
  useEffect(() => {
    if (wallet && !meLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, meLoading]);

  const entries = useMemo(() => data?.entries ?? [], [data]);
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const mine = wallet ? entries.find((e) => e.wallet === wallet) : undefined;
  const selected = entries.find((e) => e.id === selectedId) || mine || entries[0];

  const onRow = (e: LeaderboardEntry) => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) router.push(`/profile/${e.wallet}`);
    else setSelectedId(e.id);
  };

  const metric = (e: LeaderboardEntry) => (sort === "volume" ? fmtUsd(e.volume) : sort === "winrate" ? fmtPct(e.winRate) : fmtUsd(e.pnl, { signed: true }));
  const metricTone = (e: LeaderboardEntry) => (sort === "pnl" ? ((e.pnl ?? 0) >= 0 ? "text-up" : "text-dn") : "text-white");

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0">
          {/* Hero */}
          <div className="flex flex-wrap items-end justify-between gap-4">
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
            <CountrySelect value={country} onChange={setCountry} allLabel="All countries" />
            <Pills label="Sort" value={sort} onChange={setSort} options={[{ value: "pnl", label: "PnL" }, { value: "volume", label: "Volume" }, { value: "winrate", label: "Win rate" }]} />
          </div>

          {/* Claim CTA */}
          {!loading && !mine && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange/25 bg-gradient-to-r from-orange/15 via-pink/10 to-purp/15 px-4 py-3">
              <div className="text-[14px]">
                <span className="font-bold">{wallet ? "Syncing your Meteora stats…" : "LP on Meteora?"}</span>{" "}
                <span className="text-white/70">{wallet ? "Your rank shows up after the first sync." : "Connect your wallet to claim your rank. Read-only, no transactions."}</span>
              </div>
              {wallet ? (
                <button type="button" onClick={load} className="h-9 rounded-full bg-white/[.1] px-4 text-[13px] font-semibold hover:bg-white/[.16]">
                  Refresh
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
          ) : entries.length === 0 ? (
            <EmptyBoard country={country} onConnect={() => setVisible(true)} connected={Boolean(wallet)} />
          ) : (
            <div className="mt-6 grid grid-cols-3 items-end gap-2 sm:gap-3">
              {[podium[1], podium[0], podium[2]].map((e, idx) =>
                e ? (
                  <PodiumCard key={e.id} e={e} first={idx === 1} isMe={e.wallet === wallet} metric={metric(e)} tone={metricTone(e)} onClick={() => onRow(e)} range={range} />
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
                <Row key={e.id} e={e} isMe={e.wallet === wallet} metric={metric(e)} tone={metricTone(e)} onClick={() => onRow(e)} range={range} active={selected?.id === e.id} />
              ))}
            </div>
          )}
          {entries.length > 0 && entries.length < 10 && (
            <p className="mt-5 text-center text-[13px] text-mute">
              Early days: {entries.length} LP{entries.length === 1 ? "" : "s"} on the board. Share it with your LP friends and climb together.
            </p>
          )}
          {data?.error && <p className="mt-4 text-[13px] text-dn">{data.error}</p>}
        </section>

        {/* Side profile card */}
        <aside className="hidden lg:block">
          <div className="sticky top-[84px]">
            {selected ? (
              <ProfileCard
                user={selected}
                rank={selected.rank}
                isMe={selected.wallet === wallet}
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
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center rounded-[26px] px-2 pb-4 text-center transition hover:-translate-y-0.5 sm:px-4 ${first ? "podium-1 pt-6 sm:pt-7" : "glass pt-5"} ${isMe ? "outline outline-2 outline-orange/60" : ""}`}
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
      <div className="mt-0.5 hidden text-[11px] text-mute sm:block">
        Vol <span className="text-white/80">{fmtUsd(e.volume)}</span> · Win <span className="text-white/80">{fmtPct(e.winRate)}</span>
      </div>
      <div className="mt-2 max-w-full">
        <PoolChip pool={e.topPool} compact />
      </div>
    </button>
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
      <span className="num w-6 text-center text-[14px] font-bold text-mute">{e.rank}</span>
      <Avatar user={e} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] font-bold">
          <span className="truncate">{displayName(e)}</span>
          <Flag code={e.country} />
          {isMe && <span className="rounded-full bg-orange px-1.5 text-[10px] font-extrabold text-white">YOU</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-mute">
          <PoolChip pool={e.topPool} compact />
          <span className="hidden sm:inline">Vol {fmtUsd(e.volume)}</span>
          <span>Win {fmtPct(e.winRate)}</span>
        </div>
      </div>
      <div className={`num text-right text-[18px] font-extrabold sm:text-[22px] ${tone}`}>{metric}</div>
      {isMe ? (
        <a href={share} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="hidden h-8 rounded-full bg-white/[.1] px-3.5 text-[13px] font-semibold leading-8 hover:bg-white/[.16] sm:block">
          Share
        </a>
      ) : e.xHandle ? (
        <a href={`https://x.com/intent/follow?screen_name=${e.xHandle}`} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="hidden h-8 rounded-full bg-white px-3.5 text-[13px] font-bold leading-8 text-black hover:bg-white/90 sm:block">
          Follow
        </a>
      ) : (
        <Link href={`/profile/${e.wallet}`} onClick={(ev) => ev.stopPropagation()} className="hidden h-8 rounded-full bg-white/[.08] px-3.5 text-[13px] font-semibold leading-8 hover:bg-white/[.14] sm:block">
          View
        </Link>
      )}
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
