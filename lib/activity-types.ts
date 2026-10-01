/** Client-safe types for the Poolside API (`GET /api/activity`). No wallet fields, ever. */
import type { ThesisPost } from "@/lib/thesis-types";
import type { BadgeId, BadgeTier } from "@/lib/badges/config";

/** Every kind stored in the activity table. "thesis" rows exist but Poolside renders theses as posts. */
export type ActivityKind = "joined" | "followed" | "thesis" | "opened" | "closed" | "big_win" | "badge";

/** Kinds rendered as compact event rows. */
export type EventKind = Exclude<ActivityKind, "thesis">;

export type ActivityScope = "following" | "everyone";

/** "posts" = theses only; "all" = theses plus compact activity rows. */
export type FeedFilter = "all" | "posts";

/** Why the server answered with a different scope than the one asked for. */
export type ActivityFallback = "signed_out" | "no_follows" | null;

export interface ActivityPerson {
  id: number;
  xHandle: string | null;
  xAvatarUrl: string | null;
  anonName: string | null;
}

export interface ActivityPool {
  address: string;
  name: string;
  protocol: string | null;
  binStep: number | null;
  xIcon: string | null;
  yIcon: string | null;
}

export interface ActivityToken {
  mint: string;
  symbol: string | null;
}

/** A compact activity event (position opened/closed, big win, joined, followed, earned a badge). */
export interface ActivityItem {
  id: number;
  kind: EventKind;
  occurredAt: string;
  actor: ActivityPerson;
  target: ActivityPerson | null;
  pool: ActivityPool | null;
  token: ActivityToken | null;
  /** Realized PnL in USD for closes / big wins. */
  amountUsd: number | null;
  /** "badge" events: the badge and tier earned. */
  badge: { id: BadgeId; tier: BadgeTier } | null;
}

export type FeedItem =
  | { type: "post"; key: string; occurredAt: string; post: ThesisPost }
  | { type: "event"; key: string; occurredAt: string; event: ActivityItem };

export interface ActivityResponse {
  items: FeedItem[];
  nextCursor: string | null;
  scope: ActivityScope;
  filter: FeedFilter;
  fallback: ActivityFallback;
  signedIn: boolean;
}

/** `GET/PATCH /api/users/me/position-sharing`: the viewer's own Poolside position-sharing setting. */
export interface PositionSharingState {
  /** Joined the beta (only members' position activity is ever recorded). */
  joined: boolean;
  /** Opted in to showing opened / closed / big-win rows on Poolside. Off by default. */
  share: boolean;
  /** Latest opt-in time; only position activity from here on is shown. */
  since: string | null;
  /** Answered or dismissed the one-time prompt. */
  asked: boolean;
}
