import { getDb, hasDb } from "@/lib/db";
import { events } from "@/lib/db/schema";

/**
 * Product analytics. Every user action is one row in `events`: server actions are recorded in their
 * API routes with `trackEvent`, page views and clicks arrive from the browser via /api/events.
 * Never put wallet addresses, tokens or other secrets in `props`.
 */

/** Actions recorded server-side (exact; can't be blocked or faked by the browser). */
export type ServerEvent =
  | "sign_in"
  | "sign_out"
  | "link_x"
  | "terms_accept"
  | "invite_check"
  | "join"
  | "follow"
  | "unfollow"
  | "lp_idea_post"
  | "lp_idea_delete"
  | "lp_idea_like"
  | "lp_idea_unlike"
  | "banner_upload"
  | "banner_remove"
  | "profile_update"
  | "position_sharing"
  | "wallet_link"
  | "wallet_add"
  | "wallet_update"
  | "wallet_remove"
  | "stats_refresh"
  | "search"
  | "wallet_lookup"
  | "admin_invite_codes"
  | "admin_invite_toggle";

/** Actions the browser reports (page views and every button / link click). */
export const CLIENT_EVENTS = ["page_view", "click", "outbound"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

type Props = Record<string, string | number | boolean | null>;

export interface EventInput {
  name: ServerEvent | ClientEvent;
  userId?: number | null;
  visitorId?: string | null;
  path?: string | null;
  props?: Props | null;
}

/** Record one server-side action. Fire-and-forget: analytics never break the request. */
export function trackEvent(name: ServerEvent, userId: number | null | undefined, props?: Props): void {
  void recordEvents([{ name, userId: userId ?? null, props: props ?? null }]);
}

/** Insert events (batch). Errors are logged, never thrown. */
export async function recordEvents(rows: EventInput[]): Promise<void> {
  if (!hasDb() || rows.length === 0) return;
  try {
    await getDb()
      .insert(events)
      .values(
        rows.map((r) => ({
          name: r.name,
          userId: r.userId ?? null,
          visitorId: r.visitorId ?? null,
          path: r.path ? r.path.slice(0, 200) : null,
          props: r.props ?? null,
        }))
      );
  } catch (e) {
    console.error("[events] insert failed:", e instanceof Error ? e.message : e);
  }
}
