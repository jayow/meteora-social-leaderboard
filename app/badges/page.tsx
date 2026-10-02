"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/EmptyState";
import { BadgeGlyph, badgeTone } from "@/components/Badges";
import { BADGES, BADGE_GUIDE, BADGE_IDS, BADGE_THRESHOLDS, sortBadges, type ApiBadge, type BadgeId, type BadgeTier } from "@/lib/badges/config";
import { fmtPct, fmtUsd } from "@/lib/format";
import type { BadgesResponse } from "@/app/api/badges/route";

type Metrics = NonNullable<BadgesResponse["mine"]>["metrics"];

const TIER_NAME = ["Bronze", "Silver", "Gold"] as const;
/** Metal per tier (THEME.md "Medals") for step labels. */
const TIER_TEXT = ["text-bronze", "text-silver", "text-gold"] as const;

/** Stats already clear a step the viewer doesn't hold: shown beside the name, not as a progress bar. */
const LANDS = { label: "You qualify", frac: 1, qualifies: true };

/**
 * How far the viewer is from the badge's next step, or null when there's nothing left to reach. Stats
 * that already clear a step the viewer doesn't hold yet say so (badges are awarded by the sync).
 */
function progress(id: BadgeId, m: Metrics, have: BadgeTier | 0): { label: string; frac: number; qualifies?: boolean } | null {
  if (!m) return null;
  const t = BADGE_THRESHOLDS;
  const step = (current: number, steps: readonly number[], fmt: (v: number) => string, unit: string) => {
    const reached = steps.filter((v) => current >= v).length;
    if (reached > have) return { label: `You qualify for ${TIER_NAME[reached - 1]}`, frac: 1, qualifies: true };
    const next = steps.find((v) => current < v);
    if (next == null) return null;
    return { label: `${TIER_NAME[steps.indexOf(next)]} next · ${fmt(current)} of ${fmt(next)}${unit}`, frac: current / next };
  };
  const closed = m.positionsClosed ?? 0;
  switch (id) {
    case "fee_farmer":
      return step(m.feesUsd ?? 0, t.feeFarmerUsd, (v) => fmtUsd(v), " in fees");
    case "whale_volume":
      return step(m.volumeUsd ?? 0, t.whaleVolumeUsd, (v) => fmtUsd(v), " volume");
    case "pool_hopper":
      return step(m.distinctPools ?? 0, t.poolHopperPools, (v) => String(v), " pools");
    case "first_splash":
      if (have) return null;
      return closed >= t.firstSplash.minClosed ? LANDS : { label: `${closed} of ${t.firstSplash.minClosed} closed position`, frac: 0 };
    case "sharpshooter": {
      if (have) return null;
      const need = t.sharpshooter.minWinRate;
      if (closed < t.sharpshooter.minClosed) return { label: `${closed} of ${t.sharpshooter.minClosed} closed positions`, frac: closed / t.sharpshooter.minClosed };
      if ((m.winRate ?? 0) >= need) return LANDS;
      return { label: `${fmtPct(m.winRate, 1)} win rate, needs ${Math.round(need * 100)}%`, frac: (m.winRate ?? 0) / need };
    }
    case "in_the_green":
      if (have) return null;
      if (closed < t.inTheGreen.minClosed) return { label: `${closed} of ${t.inTheGreen.minClosed} closed positions`, frac: closed / t.inTheGreen.minClosed };
      return (m.totalPnlUsd ?? 0) > 0 ? LANDS : { label: "All-time PnL needs to turn positive", frac: 0.5 };
    case "podium":
      return null;
  }
}

/** Badges guide: every badge, how to earn it, how many members hold it, and the viewer's own progress. */
export default function BadgesPage() {
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/badges", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<BadgesResponse>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const mine = new Map<BadgeId, ApiBadge>((data?.mine?.badges ?? []).map((b) => [b.id, b]));
  const earnedCount = mine.size;

  return (
    <main className="mx-auto max-w-[880px] px-4 pb-10 pt-6 lg:px-6">
      <PageHeader title="Badges" description="Earned automatically from your Meteora LP stats, checked every sync. They show on your profile, the leaderboard and Poolside." />

      {data?.mine && (
        <p className="mt-4 text-base text-fg-secondary" data-testid="badges-summary">
          You have <span className="num font-semibold text-fg">{earnedCount}</span> of {BADGE_IDS.length} badges.{" "}
          <Link href="/profile/me" className="link">
            See them on your profile
          </Link>
        </p>
      )}

      {error ? (
        <EmptyState className="mt-8" title="Couldn't load badges">
          Try again in a moment.
        </EmptyState>
      ) : !data ? (
        <div className="mt-10 space-y-10" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-4">
              <span className="skeleton h-12 w-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <span className="skeleton block h-5 w-40" />
                <span className="skeleton block h-4 w-72 max-w-full" />
                <span className="skeleton block h-2 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-10 space-y-12">
          {sortBadges(BADGE_IDS.map((id) => ({ id, tier: (mine.get(id)?.tier ?? 0) as BadgeTier }))).map(({ id }) => {
            const def = BADGES[id];
            const guide = BADGE_GUIDE[id];
            const own = mine.get(id);
            const have: BadgeTier | 0 = own?.tier ?? 0;
            const pop = data.holders[id];
            const next = progress(id, data.mine?.metrics ?? null, have);
            return (
              <li key={id} className="flex gap-4 sm:gap-5" data-testid="badge-guide-row" data-badge={id}>
                {/* Glyph in the viewer's metal when earned; quiet when not yet. */}
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-raised ${have ? badgeTone(id, have) : "text-mute"}`}>
                  <BadgeGlyph id={id} size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-lg font-semibold">{def.name}</h2>
                    {next?.qualifies ? (
                      <span className="text-sm font-semibold text-accent" title="Badges are awarded when your stats sync">
                        {next.label} <span className="font-normal text-mute">· lands on your next sync</span>
                      </span>
                    ) : have ? (
                      <span className={`text-sm font-semibold ${def.tiered ? TIER_TEXT[have - 1] : "text-up"}`}>
                        {def.tiered ? `You have ${TIER_NAME[have - 1]}` : "You have it"}
                      </span>
                    ) : data.mine ? (
                      <span className="text-sm text-mute">Not yet</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-base text-fg-secondary">{guide.blurb}</p>

                  {guide.steps.length > 0 && (
                    <div className="mt-3 grid max-w-md grid-cols-3 gap-x-4" data-testid="badge-steps">
                      {guide.steps.map((stepLabel, i) => (
                        <div key={stepLabel} className="min-w-0">
                          <div className={`text-sm font-semibold ${have > i ? TIER_TEXT[i] : "text-mute"}`}>{TIER_NAME[i]}</div>
                          <div className="num text-base text-fg">{stepLabel}</div>
                          <div className="num text-xs text-mute">{pop.tiers[i]} {pop.tiers[i] === 1 ? "member" : "members"}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Population: a plain count of holders (the member base keeps growing, so no "of N"). */}
                  <p className="num mt-3 text-sm text-mute" data-testid="badge-population">
                    <span className="font-semibold text-fg-secondary">{pop.total.toLocaleString("en-US")}</span> {pop.total === 1 ? "member has it" : "members have it"}
                  </p>

                  {next && !next.qualifies && (
                    <div className="mt-3 max-w-md" data-testid="badge-progress">
                      <p className="num text-sm text-fg-secondary">{next.label}</p>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-raised">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.min(100, next.frac * 100))}%` }} />
                      </div>
                    </div>
                  )}
                  {id === "podium" && !have && data.mine && <p className="mt-3 text-sm text-fg-secondary">Climb the 30-day boards on the leaderboard to earn it.</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
