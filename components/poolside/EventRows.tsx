"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, PoolChip } from "@/components/ui";
import { displayName, fmtUsd, timeAgo } from "@/lib/format";
import type { ActivityItem, ActivityPerson } from "@/lib/activity-types";
import { BadgeGlyph, badgeTone } from "@/components/Badges";
import { BADGES, tierLabel } from "@/lib/badges/config";

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
    <Link href={profileHref(person)} className="font-semibold text-fg-secondary hover:text-fg hover:underline">
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
 * "<actor> earned <glyph> <Badge> · <Tier>". From 375px up it's one line where the actor name truncates
 * first and the badge name next, while "earned" and the tier always stay visible. On narrower phones the
 * badge part wraps to a second line as one unit instead of being cut off.
 */
function BadgeLine({ item, badge }: { item: ActivityItem; badge: NonNullable<ActivityItem["badge"]> }) {
  const tier = tierLabel(badge.id, badge.tier)?.split(" · ")[0] ?? null;
  return (
    <p
      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 whitespace-nowrap text-[12.5px] text-mute min-[375px]:flex-nowrap"
      data-testid="badge-line"
    >
      <span className="min-w-0 max-w-full truncate min-[375px]:min-w-[2.5rem]">
        <PersonLink person={item.actor} />
      </span>
      <span className="shrink-0">earned</span>
      <span className="flex min-w-0 items-center gap-1 min-[375px]:shrink-[0.3]">
        <BadgeGlyph id={badge.id} size={11} className={`shrink-0 ${badgeTone(badge.id, badge.tier)}`} />
        <span className="min-w-0 truncate font-semibold text-fg-secondary min-[375px]:min-w-[2rem]">{BADGES[badge.id].name}</span>
        {tier && (
          <span className="shrink-0" data-testid="badge-line-tier">
            · {tier}
          </span>
        )}
      </span>
    </p>
  );
}

function RowTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className="shrink-0 text-[11.5px] text-mute">
      {timeAgo(iso)}
    </time>
  );
}

/**
 * Opened / closed / big win: a readable row (avatar, name, verb, pool pair linking to the in-app pool
 * page, realized PnL on closes, time). Lighter than a thesis card: no box, muted verb, one line on
 * desktop; on phones the pool and PnL wrap under the name.
 */
function PositionRow({ item }: { item: ActivityItem }) {
  const closed = item.kind !== "opened";
  const pnl = closed ? item.amountUsd : null;
  return (
    <li className="flex items-start gap-3 py-2.5" data-testid="activity-row" data-kind={item.kind}>
      <Link href={profileHref(item.actor)} className="shrink-0" tabIndex={-1} aria-hidden>
        <Avatar user={{ id: item.actor.id, xAvatarUrl: item.actor.xAvatarUrl }} size={32} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 text-[13.5px] leading-5">
        <span className="min-w-0 max-w-full truncate">
          <PersonLink person={item.actor} />
        </span>
        <span className="shrink-0 text-mute" data-testid="position-verb">
          {closed ? "closed" : "opened"}
        </span>
        {item.pool ? (
          <Link
            href={`/pools/${item.pool.address}`}
            className="inline-flex min-w-0 max-w-full rounded-full transition hover:[&>span]:border-border-strong"
            data-testid="position-pool"
          >
            <PoolChip pool={item.pool} compact />
          </Link>
        ) : (
          <span className="text-mute">a position</span>
        )}
        {pnl != null && (
          <span className={`num shrink-0 font-semibold ${pnl >= 0 ? "text-up" : "text-dn"}`} title="Realized PnL in this pool" data-testid="position-pnl">
            {fmtUsd(pnl, { signed: true })}
          </span>
        )}
        {item.kind === "big_win" && (
          <span className="shrink-0 rounded-full border border-border px-1.5 text-[11px] font-semibold leading-[18px] text-up">Big win</span>
        )}
      </div>
      <span className="pt-1.5">
        <RowTime iso={item.occurredAt} />
      </span>
    </li>
  );
}

export function EventRow({ item }: { item: ActivityItem }) {
  if (isPositionKind(item.kind)) return <PositionRow item={item} />;
  return (
    <li className="flex items-center gap-2.5 py-1.5" data-testid="activity-row" data-kind={item.kind}>
      <Link href={profileHref(item.actor)} className="shrink-0" tabIndex={-1} aria-hidden>
        <Avatar user={{ id: item.actor.id, xAvatarUrl: item.actor.xAvatarUrl }} size={20} />
      </Link>
      {item.kind === "badge" && item.badge ? (
        <BadgeLine item={item} badge={item.badge} />
      ) : (
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-mute">
          <PersonLink person={item.actor} /> <Action item={item} />
        </p>
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
        <li className="pb-1 pl-11">
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost -ml-2 h-7 px-2 text-[12px]" data-testid="activity-run-more">
            Show {hidden} more from {displayName(items[0].actor)}
          </button>
        </li>
      )}
    </>
  );
}

/**
 * A run of consecutive activity events between thesis cards. Every row is visible; only a burst from
 * one member (e.g. one sync closing many positions) collapses behind "Show N more from <name>".
 */
export function EventRun({ items }: { items: ActivityItem[] }) {
  const bursts = toBursts(items);
  return (
    <div className="px-4 py-1.5" data-testid="activity-run">
      <ul>
        {bursts.map((b) => (
          <Burst key={b[0].id} items={b} />
        ))}
      </ul>
    </div>
  );
}
