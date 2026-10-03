import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { isAdminUser } from "@/lib/invite";
import { ANNOUNCEMENT_MAX, createAnnouncement, deleteAnnouncement, listAnnouncements, safeLink } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(): Promise<NextResponse> {
  if (!isAdminUser(await getSessionUser())) return notFound();
  return NextResponse.json({ announcements: await listAnnouncements() });
}

/** Post to every member: { body, link? } (link = a site path or an https URL). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !isAdminUser(user)) return notFound();
  const input = (await req.json().catch(() => null)) as { body?: unknown; link?: unknown } | null;
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Write a message first" }, { status: 400 });
  if (body.length > ANNOUNCEMENT_MAX) return NextResponse.json({ error: `Keep it under ${ANNOUNCEMENT_MAX} characters` }, { status: 400 });
  const rawLink = typeof input?.link === "string" ? input.link.trim() : "";
  const link = safeLink(rawLink);
  if (rawLink && !link) return NextResponse.json({ error: "Link must start with / or https://" }, { status: 400 });
  await createAnnouncement(body, link, user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isAdminUser(await getSessionUser())) return notFound();
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await deleteAnnouncement(id);
  return NextResponse.json({ ok: true });
}
