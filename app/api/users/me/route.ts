import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/session";
import { isCountryCode } from "@/lib/countries";
import { ensureAnonName, toPublicUser } from "@/lib/users";
import { trackEvent } from "@/lib/events";
import { displayNameError, normalizeDisplayName } from "@/lib/display-name";

export const dynamic = "force-dynamic";

interface PatchBody {
  country?: string | null;
  thesis?: string | null;
  unlinkX?: boolean;
  /** Custom display name (members without X): replaces the random beach name. */
  displayName?: string;
  /** The guided tour was finished or skipped. */
  tourCompleted?: boolean;
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

  if (body.tourCompleted === true) updates.tourCompletedAt = new Date();

  if (body.displayName !== undefined) {
    if (user.xHandle) return NextResponse.json({ error: "Your X name is shown while X is linked" }, { status: 400 });
    const name = normalizeDisplayName(String(body.displayName));
    const invalid = displayNameError(name);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    // Unique ignoring case, against other members' names and X handles (no impersonation).
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.id} <> ${user.id} AND (lower(${users.anonName}) = lower(${name}) OR lower(${users.xHandle}) = lower(${name}))`)
      .limit(1);
    if (taken) return NextResponse.json({ error: "That name is taken" }, { status: 409 });
    updates.anonName = name;
  }

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

  let updated: typeof users.$inferSelect | undefined;
  try {
    [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
  } catch (err: unknown) {
    // Same name claimed at the same moment: the unique index on anon_name wins.
    const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
    if (code === "23505" && updates.anonName) return NextResponse.json({ error: "That name is taken" }, { status: 409 });
    throw err;
  }
  // Without X the generated beach name is what people see, so make sure there is one.
  if (body.unlinkX === true && updated) updated = await ensureAnonName(updated);
  trackEvent("profile_update", user.id, { fields: Object.keys(updates).join(",") });
  return NextResponse.json({ ok: true, user: toPublicUser(updated) });
}
