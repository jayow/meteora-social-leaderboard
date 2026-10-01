import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { heldPools } from "@/lib/theses";
import type { ComposerResponse } from "@/lib/thesis-types";

export const dynamic = "force-dynamic";

/**
 * Who can post on Poolside and where: the signed-in member, whether they've joined, and the pools they
 * hold (the same list the comments API accepts). Private, no wallet fields.
 */
export async function GET(): Promise<NextResponse<ComposerResponse>> {
  const headers = { "Cache-Control": "private, no-store" };
  const empty: ComposerResponse = { signedIn: false, joined: false, me: null, pools: [] };
  if (!hasDb()) return NextResponse.json(empty, { headers });
  const user = await getSessionUser();
  if (!user) return NextResponse.json(empty, { headers });
  const joined = Boolean(user.joinedAt);
  return NextResponse.json(
    {
      signedIn: true,
      joined,
      me: {
        id: user.id,
        xHandle: user.xHandle,
        xName: user.xName,
        xAvatarUrl: user.xAvatarUrl,
        anonName: user.anonName,
        hasProfile: joined,
      },
      pools: joined ? await heldPools(user.id) : [],
    },
    { headers }
  );
}
