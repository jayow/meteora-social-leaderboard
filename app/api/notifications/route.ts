import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { currentAnnouncement, dismissAnnouncement, isMutableKind, listNotifications, markNotificationsSeen, setMutedKinds } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** The signed-in member's notifications, unread count and current announcement banner. */
export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.joinedAt) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const [{ items, unreadCount, muted }, announcement] = await Promise.all([listNotifications(user.id), currentAnnouncement(user.id)]);
  return NextResponse.json({ items, unreadCount, muted, announcement }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * { action: "seen" } marks everything read; { action: "dismiss" } hides the announcement banner;
 * { action: "settings", muted: [...] } sets the kinds this member turned off.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user?.joinedAt) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: unknown; muted?: unknown } | null;
  if (body?.action === "settings") {
    if (!Array.isArray(body.muted) || !body.muted.every(isMutableKind)) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
    await setMutedKinds(user.id, body.muted);
  } else if (body?.action === "seen") await markNotificationsSeen(user.id);
  else if (body?.action === "dismiss") await dismissAnnouncement(user.id);
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
