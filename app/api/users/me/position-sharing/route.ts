import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import type { PositionSharingState } from "@/lib/activity-types";

export const dynamic = "force-dynamic";

interface Row {
  joined: boolean;
  share: boolean;
  since: Date | null;
  asked: boolean;
}

const NO_STORE = { "Cache-Control": "private, no-store" };

function toState(r: Row): PositionSharingState {
  return { joined: r.joined, share: r.share, since: r.since ? new Date(r.since).toISOString() : null, asked: r.asked };
}

const SELECT = `joined_at IS NOT NULL AS joined, share_position_activity AS share, share_position_activity_since AS since,
                position_sharing_asked_at IS NOT NULL AS asked`;

/**
 * GET /api/users/me/position-sharing - the signed-in member's Poolside position-sharing setting.
 * Works with X and wallet sessions alike (session cookie only, no signature).
 */
export async function GET(): Promise<NextResponse<PositionSharingState | { error: string }>> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE });
  const { rows } = await getPool().query<Row>(`SELECT ${SELECT} FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) return NextResponse.json({ error: "Sign in first" }, { status: 401, headers: NO_STORE });
  return NextResponse.json(toState(rows[0]), { headers: NO_STORE });
}

/**
 * PATCH /api/users/me/position-sharing { share?: boolean, dismiss?: true } - owner only (the session
 * user; there is no way to address anyone else). Joined members only: position events are never
 * recorded before joining. Turning sharing on stamps `since = now()`, so only activity from this
 * moment shows (nothing from before, or from a previous opted-out stretch). Turning it off hides
 * position rows on the next read. Any answer (including "Not now") retires the one-time prompt.
 */
export async function PATCH(req: NextRequest): Promise<NextResponse<PositionSharingState | { error: string }>> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (!(req.headers.get("content-type") || "").includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const share = b.share;
  const dismiss = b.dismiss;
  if (share !== undefined && typeof share !== "boolean") return NextResponse.json({ error: "share must be a boolean" }, { status: 400 });
  if (dismiss !== undefined && dismiss !== true) return NextResponse.json({ error: "dismiss must be true" }, { status: 400 });
  if (share === undefined && dismiss === undefined) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { rows } = await getPool().query<Row>(
    `UPDATE users SET
       share_position_activity = coalesce($2::boolean, share_position_activity),
       share_position_activity_since = CASE
         WHEN $2::boolean IS TRUE AND NOT share_position_activity THEN now()
         WHEN $2::boolean IS FALSE THEN NULL
         ELSE share_position_activity_since END,
       position_sharing_asked_at = coalesce(position_sharing_asked_at, now()),
       updated_at = now()
     WHERE id = $1 AND joined_at IS NOT NULL
     RETURNING ${SELECT}`,
    [userId, share ?? null]
  );
  if (!rows[0]) return NextResponse.json({ error: "Join the beta to share your activity" }, { status: 403 });
  return NextResponse.json(toState(rows[0]), { headers: NO_STORE });
}
