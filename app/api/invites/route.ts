import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { ensureUserInvites, getUserInvites } from "@/lib/invite";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !user.joinedAt) {
    return NextResponse.json({ error: "Not authenticated or not a member" }, { status: 401 });
  }
  await ensureUserInvites(user.id);
  const codes = await getUserInvites(user.id);
  return NextResponse.json({ codes }, { status: 200 });
}
