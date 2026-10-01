"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CountryLeaderboardEntry, CountryLeaderboardResponse } from "@/lib/api-types";
import { Avatar } from "@/components/ui";
import { MEDAL, PODIUM_GRID, PODIUM_STACK_ORDER, PodiumSkeleton, RankMedal, isMedalRank, type MedalRank } from "@/components/RankMedal";
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
  return <img src={flagUrl(code, 80)} alt="" className={`shrink-0 rounded-[4px] object-cover ${className}`} loading="lazy" />;
}

/** Top LP mini link (sits above the card's overlay button, never inside it). */
function TopLp({ lp, size = 20, className = "" }: { lp: CountryLeaderboardEntry["topLp"]; size?: number; className?: string }) {
  if (!lp) return null;
  const name = displayName(lp);
  return (
    <Link
      href={lpHref(lp)}
      className={`relative z-10 inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full text-fg-secondary hover:text-fg ${className}`}
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

  if (loading && !data) return <PodiumSkeleton testId="country-skeleton" heights={{ first: "h-[128px] sm:h-[308px]", other: "h-[117px] sm:h-[275px]" }} />;
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
        <div className="mt-6 rounded-2xl border border-border bg-surface px-6 py-10 text-center" data-testid="country-empty">
          <h2 className="text-[18px] font-bold">No countries on the board yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-mute">Countries show up once members set one in their profile and their Meteora stats sync.</p>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <div className={`mx-auto mt-6 grid gap-2.5 sm:items-end sm:gap-4 ${PODIUM_GRID[podium.length]}`} data-testid="country-podium">
              {order.map((e) => (
                <CountryPodiumCard key={e.country} e={e} metric={metric} caption={caption} onPick={onPick} />
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <div
              className={`grid gap-2 ${twoCols ? "lg:grid-flow-col lg:grid-cols-2 lg:gap-x-4" : "mx-auto max-w-[660px]"} ${podium.length ? "mt-6" : "mt-5"}`}
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
        <p className="mt-5 text-center text-[12px] text-mute" data-testid="country-missing-note">
          {plural(missing, "active member")} without a country {missing === 1 ? "isn't" : "aren't"} counted here.
        </p>
      )}
      {data?.error && <p className="mt-4 text-[13px] text-dn">{data.error}</p>}
    </div>
  );
}

function CountryPodiumCard({ e, metric, caption, onPick }: { e: Ranked; metric: Metric; caption: string; onPick: (code: string) => void }) {
  const name = countryName(e.country);
  const first = e.rank === 1;
  const medal = MEDAL[e.rank];
  return (
    <div
      className={`relative flex min-w-0 items-center gap-3 rounded-2xl border px-3.5 transition sm:flex-col sm:gap-0 sm:px-5 sm:pb-5 sm:text-center ${medal.card} ${PODIUM_STACK_ORDER[e.rank]} ${first ? "py-4 sm:pt-10" : "py-3 sm:pt-8"}`}
      data-testid="country-podium-card"
      data-rank={e.rank}
    >
      <button type="button" onClick={() => onPick(e.country)} aria-label={`Show LPs from ${name}`} className="absolute inset-0 rounded-2xl" />
      <RankMedal rank={e.rank} size={first ? 30 : 26} className={`pointer-events-none sm:absolute sm:left-4 sm:top-4 ${first ? "sm:h-10 sm:w-[34px]" : "sm:h-8 sm:w-[27px]"}`} />
      {/* Flag in a metal frame, standing in for the avatar ring. */}
      <span className={`pointer-events-none inline-flex shrink-0 rounded-[9px] border-2 p-[3px] ${medal.ring}`}>
        <FlagImg code={e.country} className={first ? "h-[34px] w-12 sm:h-[54px] sm:w-[78px]" : "h-[30px] w-[42px] sm:h-[44px] sm:w-16"} />
      </span>
      <div className="min-w-0 flex-1 sm:mt-3 sm:w-full sm:flex-none">
        <div className={`pointer-events-none truncate font-bold leading-tight ${first ? "text-[15px] sm:text-[19px]" : "text-[15px] sm:text-[16px]"}`} title={name} data-testid="country-name">
          {name}
        </div>
        <div
          className={`num pointer-events-none mt-0.5 font-extrabold leading-tight tracking-tight sm:mt-2 ${first ? "text-[22px] sm:text-[38px]" : "text-[19px] sm:text-[29px]"} ${valueTone(e.value, metric)}`}
          data-testid="country-value"
        >
          {valueText(e.value, metric)}
        </div>
        <div className="pointer-events-none mt-0.5 hidden text-[12px] text-mute sm:block">{caption}</div>
        <div className="pointer-events-none mt-0.5 text-[12px] text-mute sm:mt-1">{membersText(e, metric)}</div>
        {e.topLp && (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] sm:mt-4 sm:justify-center sm:border-t sm:border-border sm:pt-3">
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
    <div className="relative flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition hover:border-border-strong sm:px-4" data-testid="country-row">
      <button type="button" onClick={() => onPick(e.country)} aria-label={`Show LPs from ${name}`} className="absolute inset-0 rounded-xl" />
      <span className="num pointer-events-none w-7 shrink-0 text-center text-[13px] font-bold text-mute" title={e.rank === null ? "No members with closed positions" : undefined}>
        {e.rank ?? "–"}
      </span>
      <FlagImg code={e.country} className="pointer-events-none h-[22px] w-8" />
      <div className="min-w-0 flex-1">
        <div className="pointer-events-none truncate text-[14px] font-semibold sm:text-[15px]" title={name}>
          {name}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-mute">
          <span className="pointer-events-none shrink-0">{membersText(e, metric)}</span>
          {e.topLp && (
            <>
              <span className="pointer-events-none shrink-0" aria-hidden>
                ·
              </span>
              <TopLp lp={e.topLp} size={16} className="text-[12px]" />
            </>
          )}
        </div>
      </div>
      <div className={`num pointer-events-none shrink-0 text-right text-[15px] font-bold sm:text-[16px] ${valueTone(e.value, metric)}`} data-testid="country-row-value">
        {valueText(e.value, metric)}
      </div>
    </div>
  );
}
