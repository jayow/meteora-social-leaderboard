"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui";
import { displayName, fmtUsd, timeAgo } from "@/lib/format";
import type { ActivityItem, ActivityPerson, ActivityPool } from "@/lib/activity-types";
import { BadgeGlyph, badgeTone } from "@/components/Badges";
import { BADGES, tierLabel } from "@/lib/badges/config";

/** Events shown before "Show N more" in a run between posts. */
const RUN_PREVIEW = 3;

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

function PoolName({ pool }: { pool: ActivityPool }) {
  return (
    <Link href={`/pools/${pool.address}`} className="font-semibold text-fg-secondary hover:text-fg hover:underline">
      {pool.name}
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
    case "opened":
      return item.pool ? (
        <>
          opened a position in <PoolName pool={item.pool} />
        </>
      ) : (
        <>opened a position</>
      );
    case "closed":
      return item.pool ? (
        <>
          closed a position in <PoolName pool={item.pool} />
        </>
      ) : (
        <>closed a position</>
      );
    case "badge": {
      if (!item.badge) return <>earned a badge</>;
      const tier = tierLabel(item.badge.id, item.badge.tier);
      return (
        <>
          earned{" "}
          <BadgeGlyph id={item.badge.id} size={11} className={`inline -mt-0.5 ${badgeTone(item.badge.id, item.badge.tier)}`} />{" "}
          <span className="font-semibold text-fg-secondary">{BADGES[item.badge.id].name}</span>
          {tier && <> · {tier.split(" · ")[0]}</>}
        </>
      );
    }
    case "big_win":
      return (
        <>
          closed a position in {item.pool ? <PoolName pool={item.pool} /> : "a pool"}
          {item.amountUsd != null && (
            <>
              {" "}
              <span className="num font-semibold text-up" title="Realized PnL in this pool">
                {fmtUsd(item.amountUsd, { signed: true })}
              </span>
            </>
          )}
        </>
      );
  }
}

export function EventRow({ item }: { item: ActivityItem }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5" data-testid="activity-row" data-kind={item.kind}>
      <Link href={profileHref(item.actor)} className="shrink-0" tabIndex={-1} aria-hidden>
        <Avatar user={{ id: item.actor.id, xAvatarUrl: item.actor.xAvatarUrl }} size={20} />
      </Link>
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-mute">
        <PersonLink person={item.actor} /> <Action item={item} />
      </p>
      <time dateTime={item.occurredAt} title={new Date(item.occurredAt).toLocaleString()} className="shrink-0 text-[11.5px] text-mute">
        {timeAgo(item.occurredAt)}
      </time>
    </li>
  );
}

/** A run of consecutive activity events between posts: compact, muted, first few then "Show N more". */
export function EventRun({ items }: { items: ActivityItem[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, RUN_PREVIEW);
  const hidden = items.length - shown.length;
  return (
    <div className="px-4 py-2" data-testid="activity-run">
      <ul>
        {shown.map((item) => (
          <EventRow key={item.id} item={item} />
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost -ml-2 h-7 px-2 text-[12px]" data-testid="activity-run-more">
          Show {hidden} more activity
        </button>
      )}
    </div>
  );
}
