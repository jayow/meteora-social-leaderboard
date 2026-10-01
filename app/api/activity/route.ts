import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { decodeCursor, followeeCount, listFeed } from "@/lib/activity";
import type { ActivityFallback, ActivityResponse, ActivityScope, FeedFilter } from "@/lib/activity-types";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

/**
 * GET /api/activity?scope=everyone|following&filter=all|posts&cursor=<opaque>&limit=<1..50>
 * Poolside: joined members' theses (posts) and, with filter=all, their activity. Everyone is the
 * default. `following` needs a session and at least one follow; otherwise the server answers with
 * `everyone` and says why in `fallback`.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ActivityResponse | { error: string }>> {
  const sp = req.nextUrl.searchParams;
  const asked: ActivityScope = sp.get("scope") === "following" ? "following" : "everyone";
  const filter: FeedFilter = sp.get("filter") === "posts" ? "posts" : "all";
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_LIMIT) : DEFAULT_LIMIT;
  const cursorParam = sp.get("cursor");
  const cursor = decodeCursor(cursorParam);
  if (cursorParam && !cursor) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  if (!hasDb()) {
    return NextResponse.json({ items: [], nextCursor: null, scope: asked, filter, fallback: null, signedIn: false });
  }

  const viewerId = await getSessionUserId();
  let scope: ActivityScope = asked;
  let fallback: ActivityFallback = null;
  if (asked === "following") {
    if (!viewerId) {
      scope = "everyone";
      fallback = "signed_out";
    } else if ((await followeeCount(viewerId)) === 0) {
      scope = "everyone";
      fallback = "no_follows";
    }
  }

  try {
    const { items, nextCursor } = await listFeed({ scope, filter, viewerId, cursor, limit });
    return NextResponse.json(
      { items, nextCursor, scope, filter, fallback, signedIn: Boolean(viewerId) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err: unknown) {
    console.error("[activity] list failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
