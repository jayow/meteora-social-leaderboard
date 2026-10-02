import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/session";
import { isCountryCode } from "@/lib/countries";
import { ensureAnonName, toPublicUser } from "@/lib/users";
import { trackEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

interface PatchBody {
  country?: string | null;
  thesis?: string | null;
  unlinkX?: boolean;
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: PatchBody = {};
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const updates: Partial<typeof users.$inferInsert> = {};

  if (body.country !== undefined) {
    if (body.country === null || body.country === "") {
      updates.country = null;
    } else if (isCountryCode(body.country)) {
      updates.country = body.country.toUpperCase();
    } else {
      return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
    }
  }

  if (body.thesis !== undefined) {
    updates.thesis = body.thesis ? body.thesis.slice(0, 1000) : null;
  }

  // Only unlink X on explicit unlinkX: true (not accidental field inclusion)
  if (body.unlinkX === true) {
    updates.xId = null;
    updates.xHandle = null;
    updates.xName = null;
    updates.xAvatarUrl = null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, user: toPublicUser(user) });
  }

  let [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
  // Without X the generated beach name is what people see, so make sure there is one.
  if (body.unlinkX === true && updated) updated = await ensureAnonName(updated);
  trackEvent("profile_update", user.id, { fields: Object.keys(updates).join(",") });
  return NextResponse.json({ ok: true, user: toPublicUser(updated) });
}
