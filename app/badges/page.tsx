"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/EmptyState";
import { BadgeMedal } from "@/components/Badges";
import { BADGES, BADGE_GUIDE, BADGE_IDS, BADGE_THRESHOLDS, sortBadges, type ApiBadge, type BadgeId, type BadgeTier } from "@/lib/badges/config";
import { fmtPct, fmtUsd } from "@/lib/format";
import type { BadgesResponse } from "@/app/api/badges/route";
import { ShareBadgeModal } from "@/components/ShareBadgeModal";
import { useMe } from "@/components/MeProvider";

type Metrics = NonNullable<BadgesResponse["mine"]>["metrics"];

const TIER_NAME = ["Bronze", "Silver", "Gold"] as const;
/** Metal per tier (THEME.md "Medals") for labels, track dots and track lines. */
const TIER_TEXT = ["text-bronze", "text-silver", "text-gold"] as const;
const TIER_DOT = ["border-bronze bg-bronze", "border-silver bg-silver", "border-gold bg-gold"] as const;
const TIER_LINE = ["bg-bronze", "bg-silver", "bg-gold"] as const;

/** Stats already clear a step the viewer doesn't hold: shown beside the name. */
const LANDS = { label: "You qualify", qualifies: true };

/**
 * How far the viewer is from the badge's next step, or null when there's nothing left to reach. Stats
 * that already clear a step the viewer doesn't hold yet say so (badges are awarded by the sync).
 */
function progress(id: BadgeId, m: Metrics, have: BadgeTier | 0): { label: string; qualifies?: boolean } | null {
  if (!m) return null;
  const t = BADGE_THRESHOLDS;
  const step = (current: number, steps: readonly number[], fmt: (v: number) => string) => {
    const reached = steps.filter((v) => current >= v).length;
    if (reached > have) return { label: `You qualify for ${TIER_NAME[reached - 1]}`, qualifies: true };
    const i = steps.findIndex((v) => current < v);
    if (i < 0) return null;
    return { label: `${fmt(current)} of ${BADGE_GUIDE[id].steps[i]} for ${TIER_NAME[i]}` };
  };
  const closed = m.positionsClosed ?? 0;
  switch (id) {
    case "fee_farmer":
      return step(m.feesUsd ?? 0, t.feeFarmerUsd, (v) => fmtUsd(v));
    case "whale_volume":
      return step(m.volumeUsd ?? 0, t.whaleVolumeUsd, (v) => fmtUsd(v));
    case "pool_hopper":
      return step(m.distinctPools ?? 0, t.poolHopperPools, (v) => String(v));
    case "pool_builder":
      if (!have && (m.poolsCreated ?? 0) === 0) return { label: "Create your first DLMM pool for Bronze" };
      return step(m.poolsCreated ?? 0, t.poolBuilderPools, (v) => String(v));
    case "first_splash":
      if (have) return null;
      return closed >= t.firstSplash.minClosed ? LANDS : { label: `${closed} of ${t.firstSplash.minClosed} closed position` };
    case "sharpshooter": {
      if (have) return null;
      const need = t.sharpshooter.minWinRate;
      if (closed < t.sharpshooter.minClosed) return { label: `${closed} of ${t.sharpshooter.minClosed} closed positions` };
      if ((m.winRate ?? 0) >= need) return LANDS;
      return { label: `${fmtPct(m.winRate, 1)} win rate, needs ${Math.round(need * 100)}%` };
    }
    case "in_the_green":
      if (have) return null;
      if (closed < t.inTheGreen.minClosed) return { label: `${closed} of ${t.inTheGreen.minClosed} closed positions` };
      return (m.totalPnlUsd ?? 0) > 0 ? LANDS : { label: "All-time PnL needs to turn positive" };
    case "podium":
      return have ? null : { label: "Climb the 30-day boards on the leaderboard to earn it" };
  }
}

/** Tier steps as a line you move along: reached steps take their metal on the dot, label and line. */
function TierTrack({ steps, have, counts }: { steps: string[]; have: BadgeTier | 0; counts: [number, number, number] }) {
  return (
    <ol className="mt-3 grid max-w-md grid-cols-3" data-testid="badge-steps">
      {steps.map((stepLabel, i) => {
        const on = have > i;
        return (
          <li key={stepLabel} className="relative min-w-0 pr-2 pt-4">
            <span className={`absolute left-0 right-0 top-1 h-0.5 ${on ? TIER_LINE[i] : "bg-surface-raised"}`} aria-hidden="true" />
            <span className={`absolute left-0 top-0 h-2.5 w-2.5 rounded-full border-2 ${on ? TIER_DOT[i] : "border-border-strong bg-bg"}`} aria-hidden="true" />
            <div className={`text-sm font-semibold ${on ? TIER_TEXT[i] : "text-mute"}`}>{TIER_NAME[i]}</div>
            <div className="num text-base text-fg-secondary">{stepLabel}</div>
            <div className="num text-xs text-mute">
              {counts[i]} {counts[i] === 1 ? "member" : "members"}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Badges guide: your collection up top, then every badge with its tiers, your progress and how many hold it. */
export default function BadgesPage() {
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState<ApiBadge | null>(null);
  const me = useMe();
  const slug = me.user?.xHandle || (me.userId != null ? String(me.userId) : null);

  useEffect(() => {
    fetch("/api/badges", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<BadgesResponse>) : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const mine = new Map<BadgeId, ApiBadge>((data?.mine?.badges ?? []).map((b) => [b.id, b]));

  return (
    <main className="mx-auto max-w-[880px] px-4 pb-10 pt-6 lg:px-6">
      <PageHeader
        title={
          <>
            Badges
            {data?.mine && (
              <span className="num ml-2 text-lg font-medium text-mute" data-testid="badges-summary">
                {mine.size} of {BADGE_IDS.length}
              </span>
            )}
          </>
        }
        description="Earned automatically from your Meteora LP stats, checked every sync."
      />

      {error ? (
        <EmptyState className="mt-8" title="Couldn't load badges">
          Try again in a moment.
        </EmptyState>
      ) : !data ? (
        <div className="mt-8 space-y-8" aria-busy="true">
          <div className="flex gap-10 border-b border-border pb-8">
            {Array.from({ length: 3 }, (_, i) => (
              <span key={i} className="skeleton h-[72px] w-[72px] rounded-full" />
            ))}
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-4">
              <span className="skeleton h-11 w-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <span className="skeleton block h-5 w-40" />
                <span className="skeleton block h-4 w-72 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Your collection: the badges you hold, big, each with Share. */}
          {data.mine && (
            <section className="mt-8 border-b border-border pb-8" aria-label="Your badges">
              {mine.size > 0 ? (
                <ul className="flex flex-wrap gap-x-6 gap-y-7 sm:gap-x-10" data-testid="my-badges">
                  {sortBadges([...mine.values()]).map((b) => {
                    const def = BADGES[b.id];
                    return (
                      <li key={b.id} className="flex w-24 flex-col items-center text-center sm:w-28">
                        <BadgeMedal id={b.id} tier={b.tier} size={72} />
                        <div className="mt-2.5 text-base font-semibold">{def.name}</div>
                        <div className={`text-sm font-semibold ${def.tiered ? TIER_TEXT[b.tier - 1] : "text-mute"}`}>{def.tiered ? TIER_NAME[b.tier - 1] : "Earned"}</div>
                        {slug && (
                          <button type="button" onClick={() => setSharing(b)} className="btn-ghost mt-1 h-7 px-2 text-sm" data-testid="share-badge">
                            Share
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-base text-fg-secondary">No badges yet. Close your first LP position to earn First Splash.</p>
              )}
              <Link href="/profile/me" className="link mt-6 inline-block text-sm">
                See them on your profile
              </Link>
            </section>
          )}

          <h2 className="mt-8 text-lg font-semibold">All badges</h2>
          <ul className="mt-2">
            {sortBadges(BADGE_IDS.map((id) => ({ id, tier: (mine.get(id)?.tier ?? 0) as BadgeTier }))).map(({ id }) => {
              const def = BADGES[id];
              const guide = BADGE_GUIDE[id];
              const own = mine.get(id);
              const have: BadgeTier | 0 = own?.tier ?? 0;
              const pop = data.holders[id];
              const next = progress(id, data.mine?.metrics ?? null, have);
              return (
                <li
                  key={id}
                  className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 border-b border-border py-5 last:border-b-0 sm:grid-cols-[44px_minmax(0,1fr)_auto]"
                  data-testid="badge-guide-row"
                  data-badge={id}
                >
                  <BadgeMedal id={id} tier={own?.tier ?? 1} held={Boolean(own)} size={44} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <h3 className="text-md font-semibold">{def.name}</h3>
                      {next?.qualifies ? (
                        <span className="text-sm font-semibold text-accent" title="Badges are awarded when your stats sync">
                          {next.label} <span className="font-normal text-mute">· lands on your next sync</span>
                        </span>
                      ) : have ? (
                        <span className={`text-sm font-semibold ${def.tiered ? TIER_TEXT[have - 1] : "text-fg-secondary"}`}>
                          {def.tiered ? `You have ${TIER_NAME[have - 1]}` : "You have it"}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-base text-fg-secondary">{guide.blurb}</p>
                    {guide.steps.length > 0 && <TierTrack steps={guide.steps} have={have} counts={pop.tiers} />}
                    {next && !next.qualifies && (
                      <p className="num mt-3 text-sm text-fg-secondary" data-testid="badge-progress">
                        {next.label}
                      </p>
                    )}
                  </div>
                  {/* Population: a plain count of holders (the member base keeps growing, so no "of N"). */}
                  <p className="num col-start-2 mt-2 text-sm text-mute sm:col-start-3 sm:mt-0.5 sm:text-right" data-testid="badge-population">
                    {pop.total.toLocaleString("en-US")} {pop.total === 1 ? "member has it" : "members have it"}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {sharing && slug && <ShareBadgeModal badge={sharing} slug={slug} onClose={() => setSharing(null)} />}
    </main>
  );
}
