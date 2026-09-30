import { NextRequest, NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/session";
import { ensureUserInvites, getUserInvites } from "@/lib/invite";
import { findUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const wallet = await getSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const user = await findUser(wallet);
  if (!user || !user.joinedAt) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  await ensureUserInvites(user.id);
  const codes = await getUserInvites(user.id);
  return NextResponse.json({ codes }, { status: 200 });
}
