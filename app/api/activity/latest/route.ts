import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { followeeCount, newestFeedKey } from "@/lib/activity";
import { EVENT_GROUPS, isEventGroup, type ActivityScope, type FeedFilter } from "@/lib/activity-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity/latest?scope=…&filter=…&groups=… → { newest: "post:12" | "event:34" | null }
 * Poolside's "new items" check: just the key of the newest item in a stream. Answers are cached in
 * memory for 30s per stream (per viewer only for Following), so however many people have Poolside open
 * the database sees at most a couple of these lookups a minute.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; newest: string | null }>();

export async function GET(req: NextRequest): Promise<NextResponse<{ newest: string | null } | { error: string }>> {
  if (!hasDb()) return NextResponse.json({ newest: null });
  const sp = req.nextUrl.searchParams;
  const f = sp.get("filter");
  const filter: FeedFilter = f === "posts" || f === "events" ? f : "all";
  const groupsParam = sp.get("groups");
  const groups = groupsParam === null ? null : groupsParam.split(",").filter(isEventGroup).sort();
  const kinds = groups === null ? undefined : EVENT_GROUPS.filter((g) => groups.includes(g.value)).flatMap((g) => g.kinds);

  // Same scope rules as /api/activity: Following needs a session and at least one follow.
  let scope: ActivityScope = sp.get("scope") === "following" ? "following" : "everyone";
  const viewerId = await getSessionUserId();
  if (scope === "following" && (!viewerId || (await followeeCount(viewerId)) === 0)) scope = "everyone";

  const key = [scope, filter, groups?.join(",") ?? "*", scope === "following" ? viewerId : ""].join("|");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ newest: hit.newest }, { headers: { "Cache-Control": "private, no-store" } });

  try {
    const newest = await newestFeedKey({ scope, filter, kinds, viewerId });
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(key, { at: Date.now(), newest });
    return NextResponse.json({ newest }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: unknown) {
    console.error("[activity/latest] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to check for new items" }, { status: 500 });
  }
}
