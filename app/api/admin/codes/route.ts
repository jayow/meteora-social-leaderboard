import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { isAdminUser, createAdminCodes } from "@/lib/invite";
import { trackEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: { count?: number; maxUses?: number } = {};
  try {
    body = (await req.json()) as { count?: number; maxUses?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { count = 1, maxUses = 1 } = body;
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return NextResponse.json({ error: "Invalid count" }, { status: 400 });
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) {
    return NextResponse.json({ error: "Invalid maxUses" }, { status: 400 });
  }
  const codes = await createAdminCodes(count, maxUses);
  trackEvent("admin_invite_codes", user?.id ?? null, { count, maxUses });
  return NextResponse.json({ codes }, { status: 200 });
}
