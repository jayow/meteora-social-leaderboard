import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { redeemCode } from "@/lib/invite";
import { toPublicUser } from "@/lib/users";
import { recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Wallet or X session, keyed by user id. Redeeming updates THIS user (never creates one).
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  let body: { code?: string; country?: string | null; thesis?: string | null } = {};
  try {
    body = (await req.json()) as { code?: string; country?: string | null; thesis?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { code, country, thesis } = body;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  const result = await redeemCode(userId, code.trim(), country, thesis);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: result.error || "Failed to join" }, { status: 400 });
  }
  await recordActivity({ actorUserId: result.user.id, kind: "joined", dedupeKey: `joined:${result.user.id}`, occurredAt: result.user.joinedAt });
  return NextResponse.json({ ok: true, user: toPublicUser(result.user, true) }, { status: 200 });
}
