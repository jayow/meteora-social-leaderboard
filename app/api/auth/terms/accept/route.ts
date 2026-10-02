import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/session";
import { TERMS_VERSION } from "@/lib/legal";
import { trackEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  let body: { termsVersion?: string } = {};
  try {
    body = (await req.json()) as { termsVersion?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.termsVersion !== TERMS_VERSION) return NextResponse.json({ error: "Terms version is not current" }, { status: 400 });
  const [user] = await getDb().update(users).set({ termsVersionAccepted: TERMS_VERSION, termsAcceptedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  trackEvent("terms_accept", userId, { version: TERMS_VERSION });
  return NextResponse.json({ ok: true, termsVersion: TERMS_VERSION });
}
