import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/search";
import { trackEvent } from "@/lib/events";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Universal search: members, tokens, pools (lib/search.ts). Members-only via the beta gate. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await search(q);
  if (results.query.length >= 2) {
    // Length and result counts only: search text can contain addresses.
    trackEvent("search", await getSessionUserId(), {
      length: results.query.length,
      users: results.users.length,
      tokens: results.tokens.length,
      pools: results.pools.length,
    });
  }
  return NextResponse.json(results, { headers: { "Cache-Control": "private, no-store" } });
}
