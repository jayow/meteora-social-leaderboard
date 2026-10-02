"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { displayName, fmtPrice, fmtUsd, timeAgo } from "@/lib/format";
import type { ActivityItem, ActivityPerson } from "@/lib/activity-types";
import { BadgeGlyph, badgeTone } from "@/components/Badges";
import { BADGES, tierLabel } from "@/lib/badges/config";
import { binLabel } from "@/components/ui";

/**
 * Rows from one member's burst (same actor, back to back, each within BURST_GAP_MS of the next, e.g.
 * one sync closing a dozen positions) shown before "Show N more from <name>". Everything else is
 * always visible; a burst only collapses when hiding saves at least 2 rows.
 */
const BURST_PREVIEW = 2;
const BURST_GAP_MS = 10 * 60 * 1000;

const isPositionKind = (k: ActivityItem["kind"]) => k === "opened" || k === "closed" || k === "big_win";

function profileHref(p: ActivityPerson): string {
  return `/profile/${p.xHandle || p.id}`;
}

function PersonLink({ person }: { person: ActivityPerson }) {
  return (
    <Link href={profileHref(person)} className="font-semibold text-fg-secondary transition hover:text-fg">
      {displayName(person)}
    </Link>
  );
}

function Action({ item }: { item: ActivityItem }) {
  switch (item.kind) {
    case "joined":
      return <>joined the beta</>;
    case "followed":
      return item.target ? (
        <>
          followed <PersonLink person={item.target} />
        </>
      ) : (
        <>followed someone</>
      );
    case "badge":
      // Rendered by BadgeLine (its own flex layout so the tier never gets cut off).
      return <>earned a badge</>;
    case "opened":
    case "closed":
    case "big_win":
      // Rendered by PositionRow.
      return null;
  }
}

/** Water line shared by the trade glyphs, so opens, closes and big wins read as one family. */
const WATER = "M1.75 12.75c1.05-.9 2.1-.9 3.15 0s2.1.9 3.1 0 2.1-.9 3.15 0 2.05.9 3.1 0";

/**
 * Event glyphs, drawn for Poolside rather than taken from a stock set: a drop into the water (opened,
 * "dip in"), stepping out of it (closed), a splash (big win), a pool float (joined), a person plus
 * (followed). One line weight, no backgrounds; colour only where it means something.
 */
const GLYPHS: Record<Exclude<ActivityItem["kind"], "badge">, string[]> = {
  opened: [WATER, "M8 2.25c-1.35 1.85-2.15 3.05-2.15 4.1a2.15 2.15 0 0 0 4.3 0c0-1.05-.8-2.25-2.15-4.1z"],
  closed: [WATER, "M8 9.75V3M5.75 5.25 8 3l2.25 2.25"],
  big_win: [WATER, "M8 9.25V4.5M5 9.75 3.75 7M11 9.75 12.25 7M8 2.25v.01"],
  joined: [
    "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z",
    "M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
    "M4.1 4.1l2.15 2.15M9.75 9.75l2.15 2.15M11.9 4.1 9.75 6.25M6.25 9.75 4.1 11.9",
  ],
  followed: ["M6.5 7.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5z", "M2.25 13.25c.35-2.25 2.05-3.6 4.25-3.6s3.9 1.35 4.25 3.6", "M12.75 5.25v3.5M11 7h3.5"],
};

/** Opens in accent, big wins in gold, badges in their metal; everything else stays quiet. */
function glyphTone(kind: ActivityItem["kind"]): string {
  if (kind === "opened") return "text-accent";
  if (kind === "big_win") return "text-gold";
  return "text-mute";
}

function KindIcon({ item }: { item: ActivityItem }) {
  if (item.kind === "badge" && item.badge) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
        <BadgeGlyph id={item.badge.id} size={14} className={badgeTone(item.badge.id, item.badge.tier)} />
      </span>
    );
  }
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${glyphTone(item.kind)}`} aria-hidden="true">
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {GLYPHS[item.kind as Exclude<ActivityItem["kind"], "badge">].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

function RowTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className="w-14 shrink-0 text-right text-sm text-mute">
      {timeAgo(iso)}
    </time>
  );
}

/**
 * Pool name in a trade row: a link to the pool page with a small preview on hover / keyboard focus
 * (bin step, base fee, the position's bins and range when the sync recorded them). Portaled, since the
 * row clips its text.
 */
function PoolLink({ item }: { item: ActivityItem }) {
  const pool = item.pool;
  const anchor = useRef<HTMLAnchorElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const W = 232;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), top: r.bottom + 6 });
  }, [open]);
  if (!pool) return <>a position</>;
  const d = item.detail;
  const facts: { label: string; value: string }[] = [];
  if (d?.baseFeePct != null) facts.push({ label: "Base fee", value: `${Number(d.baseFeePct.toFixed(4))}%` });
  if (pool.binStep != null) facts.push({ label: "Bin step", value: String(pool.binStep) });
  if (d?.bins != null) facts.push({ label: d.positions && d.positions > 1 ? `Bins (${d.positions} positions)` : "Bins", value: d.bins.toLocaleString("en-US") });
  if (d?.minPrice != null && d.maxPrice != null) facts.push({ label: "Range", value: `${fmtPrice(d.minPrice)} – ${fmtPrice(d.maxPrice)}` });
  return (
    <>
      <Link
        ref={anchor}
        href={`/pools/${pool.address}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="whitespace-nowrap font-medium text-fg-secondary underline-offset-2 transition hover:text-fg hover:underline"
        data-testid="position-pool"
      >
        {pool.name}
      </Link>
      {open &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 w-[232px] rounded-tile border border-border-strong bg-surface-raised p-3 text-sm shadow-lg shadow-black/40"
            style={{ left: pos.left, top: pos.top }}
            data-testid="pool-preview"
          >
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-fg">{pool.name}</span>
              {pool.binStep != null && <span className="chip">{binLabel(pool.binStep)}</span>}
            </div>
            {facts.length > 0 && (
              <dl className="mt-2 space-y-1">
                {facts.map((f) => (
                  <div key={f.label} className="flex justify-between gap-3">
                    <dt className="text-mute">{f.label}</dt>
                    <dd className="num font-medium text-fg">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-2 text-xs text-mute">Click to open the pool</p>
          </div>,
          document.body,
        )}
    </>
  );
}

/** What happened, in words: "closed SOL-USDC", "earned Podium · Silver", "followed @x". */
function Sentence({ item }: { item: ActivityItem }) {
  if (isPositionKind(item.kind)) {
    return (
      <>
        {item.kind === "opened" ? "opened" : "closed"} <PoolLink item={item} />
        {/* Bins and fee at a glance; the hover preview has the range too. */}
        {(item.detail?.bins != null || item.detail?.baseFeePct != null) && (
          <span className="num whitespace-nowrap text-sm text-mute">
            {item.detail?.bins != null && <> · {item.detail.bins.toLocaleString("en-US")} bins</>}
            {item.detail?.baseFeePct != null && <> · {Number(item.detail.baseFeePct.toFixed(4))}% fee</>}
          </span>
        )}
      </>
    );
  }
  if (item.kind === "badge" && item.badge) {
    const tier = tierLabel(item.badge.id, item.badge.tier)?.split(" · ")[0] ?? null;
    return (
      <span data-testid="badge-line">
        earned <span className="font-medium text-fg-secondary">{BADGES[item.badge.id].name}</span>
        {tier && <span data-testid="badge-line-tier"> · {tier}</span>}
      </span>
    );
  }
  return <Action item={item} />;
}

/**
 * Every event is one quiet line in the same columns: kind glyph, "<name> <did what>", realized PnL
 * (closes only), time. No avatars or pool chips, so posts stay the loud thing in the feed.
 */
export function EventRow({ item }: { item: ActivityItem }) {
  const pnl = item.kind !== "opened" && isPositionKind(item.kind) ? item.amountUsd : null;
  return (
    <li className="flex items-center gap-3 py-2" data-testid="activity-row" data-kind={item.kind}>
      <KindIcon item={item} />
      {/* Phones wrap to two lines rather than cutting off the pool name. */}
      <p className="line-clamp-2 min-w-0 flex-1 text-base text-mute sm:truncate">
        <PersonLink person={item.actor} /> <Sentence item={item} />
      </p>
      {pnl != null && (
        <span className={`num shrink-0 text-base font-semibold ${pnl >= 0 ? "text-up" : "text-dn"}`} title="Realized PnL in this pool" data-testid="position-pnl">
          {fmtUsd(pnl, { signed: true })}
        </span>
      )}
      <RowTime iso={item.occurredAt} />
    </li>
  );
}

/** Split a run into bursts: consecutive events by the same member, each close in time to the next. */
function toBursts(items: ActivityItem[]): ActivityItem[][] {
  const out: ActivityItem[][] = [];
  for (const it of items) {
    const cur = out[out.length - 1];
    const prev = cur?.[cur.length - 1];
    if (prev && prev.actor.id === it.actor.id && Math.abs(Date.parse(prev.occurredAt) - Date.parse(it.occurredAt)) <= BURST_GAP_MS) cur.push(it);
    else out.push([it]);
  }
  return out;
}

function Burst({ items }: { items: ActivityItem[] }) {
  const [open, setOpen] = useState(false);
  const collapsible = items.length > BURST_PREVIEW + 1;
  const shown = open || !collapsible ? items : items.slice(0, BURST_PREVIEW);
  const hidden = items.length - shown.length;
  return (
    <>
      {shown.map((item) => (
        <EventRow key={item.id} item={item} />
      ))}
      {hidden > 0 && (
        <li className="pb-1 pl-9">
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost -ml-3 h-8 px-3" data-testid="activity-run-more">
            Show {hidden} more from {displayName(items[0].actor)}
          </button>
        </li>
      )}
    </>
  );
}

/**
 * A run of activity events (one day on Poolside's Activity tab). Every row is visible; only a burst from
 * one member (e.g. one sync closing many positions) collapses behind "Show N more from <name>".
 */
export function EventRun({ items }: { items: ActivityItem[] }) {
  const bursts = toBursts(items);
  return (
    <div className="py-1" data-testid="activity-run">
      <ul>
        {bursts.map((b) => (
          <Burst key={b[0].id} items={b} />
        ))}
      </ul>
    </div>
  );
}
