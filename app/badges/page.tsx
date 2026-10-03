"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/** Popover width and the gap kept from the screen edge. */
const POP_W = 320;
const EDGE = 16;

/**
 * One medallion on the wall, with its details in a popover: opens on mouse hover, keyboard focus or a
 * tap, closes on leave, blur, Escape or a tap outside. The popover sits in the DOM right after the
 * medallion (so Tab reaches Share) and is shifted sideways to stay on screen.
 */
function MedalSlot({
  id,
  own,
  next,
  pop,
  open,
  onOpen,
  onClose,
  onShare,
}: {
  id: BadgeId;
  own: ApiBadge | undefined;
  next: ReturnType<typeof progress>;
  pop: BadgesResponse["holders"][BadgeId];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onShare: (() => void) | null;
}) {
  const wrap = useRef<HTMLLIElement>(null);
  // Pointer type of the press in progress, so a tap's focus doesn't open it before the click toggles.
  const press = useRef<string | null>(null);
  const [left, setLeft] = useState(0);
  const def = BADGES[id];
  const guide = BADGE_GUIDE[id];
  const have: BadgeTier | 0 = own?.tier ?? 0;
  const status = next?.qualifies
    ? `${next.label}, lands on your next sync`
    : have
      ? def.tiered
        ? `You have ${TIER_NAME[have - 1]}`
        : "You have it"
      : "Not earned yet";
  const popId = `badge-pop-${id}`;

  useLayoutEffect(() => {
    if (!open || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    const w = Math.min(POP_W, window.innerWidth - 2 * EDGE);
    const x = Math.min(Math.max(r.left + r.width / 2 - w / 2, EDGE), window.innerWidth - EDGE - w);
    setLeft(x - r.left);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <li
      ref={wrap}
      className="relative flex justify-center"
      onPointerEnter={(e) => e.pointerType === "mouse" && onOpen()}
      onPointerLeave={(e) => e.pointerType === "mouse" && onClose()}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) onClose();
      }}
      data-testid="badge-guide-row"
      data-badge={id}
    >
      <button
        type="button"
        aria-label={`${def.name}: ${status}`}
        aria-expanded={open}
        aria-controls={popId}
        onPointerDown={(e) => {
          press.current = e.pointerType;
        }}
        onFocus={() => {
          if (!press.current) onOpen();
        }}
        onClick={() => {
          // Mouse: hover already opened it. Touch / pen: tap toggles. Keyboard (Enter / Space): toggles.
          const by = press.current;
          press.current = null;
          if (by === "mouse") onOpen();
          else if (open) onClose();
          else onOpen();
        }}
        className="rounded-full transition-transform duration-150 hover:scale-105 motion-reduce:transition-none"
      >
        <BadgeMedal id={id} tier={own?.tier ?? 1} held={Boolean(own)} size={80} />
      </button>

      {open && (
        // pt-2 instead of a margin so the pointer can cross into the popover without leaving the slot.
        <div id={popId} className="absolute top-full z-30 pt-2" style={{ left, width: `min(${POP_W}px, calc(100vw - ${2 * EDGE}px))` }}>
          <div className="rounded-tile border border-border-strong bg-surface-raised p-4 text-left shadow-lg shadow-black/40" data-testid="badge-popover">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h3 className="text-md font-semibold">{def.name}</h3>
              {next?.qualifies ? (
                <span className="text-sm font-semibold text-accent">{next.label}</span>
              ) : have ? (
                <span className={`text-sm font-semibold ${def.tiered ? TIER_TEXT[have - 1] : "text-fg-secondary"}`}>
                  {def.tiered ? `You have ${TIER_NAME[have - 1]}` : "You have it"}
                </span>
              ) : null}
            </div>
            {next?.qualifies && <p className="text-sm text-mute">Lands on your next sync</p>}
            <p className="mt-1 text-base text-fg-secondary">{guide.blurb}</p>
            {guide.steps.length > 0 && <TierTrack steps={guide.steps} have={have} counts={pop.tiers} />}
            {next && !next.qualifies && (
              <p className="num mt-3 text-sm text-fg-secondary" data-testid="badge-progress">
                {next.label}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              {/* Population: a plain count of holders (the member base keeps growing, so no "of N"). */}
              <p className="num text-sm text-mute" data-testid="badge-population">
                {pop.total.toLocaleString("en-US")} {pop.total === 1 ? "member has it" : "members have it"}
              </p>
              {onShare && (
                <button type="button" onClick={onShare} className="btn-secondary h-8 px-3 text-sm" data-testid="share-badge">
                  Share
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/** Badges: every badge as a medallion (yours first); the details live in each one's popover. */
export default function BadgesPage() {
  const [data, setData] = useState<BadgesResponse | null>(null);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState<ApiBadge | null>(null);
  const [openId, setOpenId] = useState<BadgeId | null>(null);
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
    <main className="mx-auto min-h-[70vh] max-w-[880px] px-4 pb-10 pt-6 lg:px-6">
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
        description="Earned automatically from your Meteora LP stats, checked every sync. Hover or tap a badge for how to earn it."
      />

      {error ? (
        <EmptyState className="mt-8" title="Couldn't load badges">
          Try again in a moment.
        </EmptyState>
      ) : !data ? (
        <div className="mt-10 grid grid-cols-4 justify-items-center gap-y-8 md:grid-cols-8" aria-busy="true">
          {BADGE_IDS.map((id) => (
            <span key={id} className="skeleton h-20 w-20 rounded-full" />
          ))}
        </div>
      ) : (
        <>
          <ul className="mt-10 grid grid-cols-4 justify-items-center gap-y-8 md:grid-cols-8" data-testid="badge-wall">
            {sortBadges(BADGE_IDS.map((id) => ({ id, tier: (mine.get(id)?.tier ?? 0) as BadgeTier }))).map(({ id }) => {
              const own = mine.get(id);
              return (
                <MedalSlot
                  key={id}
                  id={id}
                  own={own}
                  next={progress(id, data.mine?.metrics ?? null, own?.tier ?? 0)}
                  pop={data.holders[id]}
                  open={openId === id}
                  onOpen={() => setOpenId(id)}
                  onClose={() => setOpenId((cur) => (cur === id ? null : cur))}
                  onShare={own && slug ? () => setSharing(own) : null}
                />
              );
            })}
          </ul>
          {data.mine && (
            <Link href="/profile/me" className="link mt-10 inline-block text-sm">
              See them on your profile
            </Link>
          )}
        </>
      )}
      {sharing && slug && <ShareBadgeModal badge={sharing} slug={slug} onClose={() => setSharing(null)} />}
    </main>
  );
}
