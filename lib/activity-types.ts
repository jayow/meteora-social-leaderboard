/** Client-safe types for the Activity feed API (`GET /api/activity`). No wallet fields, ever. */

export type ActivityKind = "joined" | "followed" | "thesis" | "opened" | "closed" | "big_win";

export type ActivityScope = "following" | "everyone";

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

export interface ActivityItem {
  id: number;
  kind: ActivityKind;
  occurredAt: string;
  actor: ActivityPerson;
  target: ActivityPerson | null;
  pool: ActivityPool | null;
  token: ActivityToken | null;
  /** Short excerpt of a token thesis (comment). */
  snippet: string | null;
  /** Realized PnL in USD for closes / big wins. */
  amountUsd: number | null;
}

export interface ActivityResponse {
  items: ActivityItem[];
  nextCursor: string | null;
  scope: ActivityScope;
  fallback: ActivityFallback;
  signedIn: boolean;
}
