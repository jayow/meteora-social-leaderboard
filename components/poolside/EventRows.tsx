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

/**
 * Subtle colour per kind (a faint tint behind a coloured glyph): opens in accent, closes in the colour of
 * their PnL, big wins in gold, social events (joined, followed) stay neutral. Enough to scan, not to shout.
 */
function kindTone(item: ActivityItem): string {
  switch (item.kind) {
    case "opened":
      return "bg-accent/10 text-accent";
    case "closed":
      return (item.amountUsd ?? 0) < 0 ? "bg-dn/10 text-dn" : "bg-up/10 text-up";
    case "big_win":
      return "bg-gold/10 text-gold";
    default:
      return "bg-surface-raised text-mute";
  }
}

/** One small glyph per event kind, so a run of events scans by type before anyone reads it. */
function KindIcon({ item }: { item: ActivityItem }) {
  if (item.kind === "badge" && item.badge) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-raised" aria-hidden="true">
        <BadgeGlyph id={item.badge.id} size={12} className={badgeTone(item.badge.id, item.badge.tier)} />
      </span>
    );
  }
  const paths: Record<Exclude<ActivityItem["kind"], "badge">, string> = {
    opened: "M8 3.5v9M3.5 8h9",
    closed: "M3.5 8.5l3 3 6-6.5",
    big_win: "M4.5 11.5l7-7M6 4.5h5.5V10",
    joined: "M2 9.5c1.5-1.5 3-1.5 4 0s2.5 1.5 4 0 2.5-1.5 4 0M2 6.5c1.5-1.5 3-1.5 4 0s2.5 1.5 4 0 2.5-1.5 4 0",
    followed: "M6 7.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5zM2 13.5c0-2.2 1.8-3.75 4-3.75s4 1.55 4 3.75M12.5 5v5M10 7.5h5",
  };
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${kindTone(item)}`} aria-hidden="true">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[item.kind as Exclude<ActivityItem["kind"], "badge">]} />
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
