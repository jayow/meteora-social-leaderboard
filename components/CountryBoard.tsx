"use client";

import { EmptyState } from "@/components/EmptyState";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CountryLeaderboardEntry, CountryLeaderboardResponse } from "@/lib/api-types";
import { Avatar } from "@/components/ui";
import { LIST_ROW, MEDAL, MedalPin, PODIUM_GRID, PODIUM_LIFT, PODIUM_SLOT, PODIUM_STACK_ORDER, PODIUM_WRAP, PodiumSkeleton, isMedalRank, listWrap, type MedalRank } from "@/components/RankMedal";
import { countryName, flagUrl } from "@/lib/countries";
import { displayName, fmtPct, fmtUsd } from "@/lib/format";

type Range = "7d" | "30d" | "all";
type Metric = "pnl" | "fees" | "volume" | "winrate";
type Ranked = CountryLeaderboardEntry & { rank: MedalRank };

function valueText(v: number | null, m: Metric): string {
  if (m === "winrate") return fmtPct(v);
  return fmtUsd(v, { signed: m === "pnl" });
}
function valueTone(v: number | null, m: Metric): string {
  if (m === "fees") return "text-up";
  if (m !== "pnl" || v === null) return "text-fg";
  return v >= 0 ? "text-up" : "text-dn";
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "4 members", or for win rate how many members the average covers. */
function membersText(e: CountryLeaderboardEntry, m: Metric): string {
  if (m === "winrate" && e.winRateMembers !== e.members) return `avg of ${e.winRateMembers} of ${plural(e.members, "member")}`;
  return plural(e.members, "member");
}
const lpHref = (lp: NonNullable<CountryLeaderboardEntry["topLp"]>) => `/profile/${lp.xHandle || lp.id}`;

function FlagImg({ code, className }: { code: string; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={flagUrl(code, 80)} alt="" className={`shrink-0 rounded-[3px] object-cover ${className}`} loading="lazy" />;
}

/** Top LP mini link (sits above the card's overlay button, never inside it). */
function TopLp({ lp, size = 20, className = "" }: { lp: CountryLeaderboardEntry["topLp"]; size?: number; className?: string }) {
  if (!lp) return null;
  const name = displayName(lp);
  return (
    <Link
      href={lpHref(lp)}
      className={`relative z-10 inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full text-fg-secondary transition hover:text-fg ${className}`}
      title={`Top LP: ${name}`}
      data-testid="country-top-lp"
    >
      <Avatar user={lp} size={size} />
      <span className="truncate">{name}</span>
    </Link>
  );
}

/**
 * Countries view of the leaderboard: joined members with a country and Meteora activity, aggregated
 * server-side per metric (totals; win rate is an average). Picking a country opens the members
 * board filtered to it.
 */
export function CountryBoard({
  range,
  metric,
  metricLabel,
  rangeShort,
  onPick,
}: {
  range: Range;
  metric: Metric;
  metricLabel: string;
  rangeShort: string;
  onPick: (code: string) => void;
}) {
  const [data, setData] = useState<CountryLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/leaderboard/countries?${new URLSearchParams({ range, sort: metric }).toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as CountryLeaderboardResponse;
        if (!res.ok || !Array.isArray(body.entries)) throw new Error(body.error || "load failed");
        if (live) setData(body);
      })
      .catch(() => {
        if (live) setData({ range, sort: metric, entries: [], noCountryMembers: 0, error: "Couldn't load countries" });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [range, metric]);

  if (loading && !data) return <PodiumSkeleton testId="country-skeleton" />;
  const entries = data?.entries ?? [];
  const podium = entries.filter((e): e is Ranked => isMedalRank(e.rank));
  const rest = entries.filter((e) => !isMedalRank(e.rank));
  const order = [2, 1, 3].flatMap((r) => podium.filter((e) => e.rank === r));
  const twoCols = rest.length >= 6;
  const rowsPerCol = twoCols ? Math.ceil(rest.length / 2) : rest.length;
  const caption = `${metric === "winrate" ? "Avg win rate" : `Total ${metricLabel === "PnL" ? "PnL" : metricLabel.toLowerCase()}`} · ${rangeShort}`;
  const missing = data?.noCountryMembers ?? 0;

  return (
    <div data-testid="country-board" aria-busy={loading || undefined}>
      {entries.length === 0 ? (
        <EmptyState className="mt-6" testId="country-empty" title="No countries on the board yet">
          Countries show up once members set one in their profile and their Meteora stats sync.
        </EmptyState>
      ) : (
        <>
          {podium.length > 0 && (
            <div className={`${PODIUM_WRAP} ${PODIUM_GRID[podium.length]}`} data-testid="country-podium">
              {order.map((e) => (
                <CountryPodiumCard key={e.country} e={e} metric={metric} caption={caption} onPick={onPick} />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <div
              className={listWrap(twoCols, podium.length > 0)}
              style={twoCols ? { gridTemplateRows: `repeat(${rowsPerCol}, minmax(0, auto))` } : undefined}
              data-testid="country-rows"
            >
              {rest.map((e) => (
                <CountryRow key={e.country} e={e} metric={metric} onPick={onPick} />
              ))}
            </div>
          )}
        </>
      )}
      {missing > 0 && (
        <p className="mt-5 text-center text-sm text-mute" data-testid="country-missing-note">
          {plural(missing, "active member")} without a country {missing === 1 ? "isn't" : "aren't"} counted here.
        </p>
      )}
      {data?.error && <p className="mt-4 text-base text-dn">{data.error}</p>}
    </div>
  );
}

function CountryPodiumCard({ e, metric, caption, onPick }: { e: Ranked; metric: Metric; caption: string; onPick: (code: string) => void }) {
  const name = countryName(e.country);
  const first = e.rank === 1;
  const medal = MEDAL[e.rank];
  return (
    <div className={`${PODIUM_SLOT} ${PODIUM_STACK_ORDER[e.rank]} ${PODIUM_LIFT[e.rank]}`} data-testid="country-podium-card" data-rank={e.rank}>
      <button type="button" onClick={() => onPick(e.country)} aria-label={`Show LPs from ${name}`} className="absolute inset-0 sm:rounded-card" />
      {/* Flag in a metal frame, standing in for the avatar ring; the medal pinned underneath. */}
      <span className="pointer-events-none relative shrink-0">
        <span className={`inline-flex rounded-[9px] border-2 p-[3px] ${medal.ring}`}>
          <FlagImg code={e.country} className={first ? "h-[34px] w-12 sm:h-[64px] sm:w-[92px]" : "h-[30px] w-[42px] sm:h-[50px] sm:w-[72px]"} />
        </span>
        <MedalPin rank={e.rank} first={first} />
      </span>
      <div className="min-w-0 flex-1 sm:mt-6 sm:w-full sm:flex-none">
        <div className={`pointer-events-none truncate font-semibold ${first ? "text-md sm:text-lg" : "text-md"}`} title={name} data-testid="country-name">
          {name}
        </div>
        <div
          className={`num pointer-events-none mt-0.5 text-xl font-bold tracking-tight sm:mt-1.5 ${first ? "sm:text-3xl" : "sm:text-2xl"} ${valueTone(e.value, metric)}`}
          data-testid="country-value"
        >
          {valueText(e.value, metric)}
        </div>
        <div className="pointer-events-none mt-1 hidden text-sm text-mute sm:block">{caption}</div>
        <div className="pointer-events-none mt-0.5 text-sm text-mute sm:mt-1">{membersText(e, metric)}</div>
        {e.topLp && (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm sm:mt-3 sm:justify-center">
            <span className="pointer-events-none shrink-0 text-mute">Top LP</span>
            <TopLp lp={e.topLp} size={20} className="font-semibold" />
          </div>
        )}
      </div>
    </div>
  );
}

function CountryRow({ e, metric, onPick }: { e: CountryLeaderboardEntry; metric: Metric; onPick: (code: string) => void }) {
  const name = countryName(e.country);
  return (
    <div className={LIST_ROW} data-testid="country-row">
      <button type="button" onClick={() => onPick(e.country)} aria-label={`Show LPs from ${name}`} className="absolute inset-0" />
      <span className="num pointer-events-none w-6 shrink-0 text-right text-sm text-mute" title={e.rank === null ? "No members with closed positions" : undefined}>
        {e.rank ?? "–"}
      </span>
      <FlagImg code={e.country} className="pointer-events-none h-[22px] w-8" />
      <div className="min-w-0 flex-1">
        <div className="pointer-events-none truncate text-md font-medium text-fg" title={name}>
          {name}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-mute">
          <span className="pointer-events-none shrink-0">{membersText(e, metric)}</span>
          {e.topLp && (
            <>
              <span className="pointer-events-none shrink-0" aria-hidden>
                ·
              </span>
              <TopLp lp={e.topLp} size={16} className="text-sm" />
            </>
          )}
        </div>
      </div>
      <div className={`num pointer-events-none shrink-0 text-right text-md font-bold ${valueTone(e.value, metric)}`} data-testid="country-row-value">
        {valueText(e.value, metric)}
      </div>
    </div>
  );
}
