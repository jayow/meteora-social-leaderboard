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
    case "badge":
      // Rendered by BadgeLine (its own flex layout so the tier never gets cut off).
      return <>earned a badge</>;
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

export function EventRow({ item }: { item: ActivityItem }) {
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
