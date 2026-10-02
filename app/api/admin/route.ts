import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { isAdminUser, getMemberCount, betaCap, getAllCodes, getRecentJoins } from "@/lib/invite";
import { getAdminStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const memberCount = await getMemberCount();
  const cap = betaCap();
  const codes = await getAllCodes();
  const recentJoins = await getRecentJoins(50);
  const stats = await getAdminStats();
  return NextResponse.json({ memberCount, cap, codes, recentJoins, stats }, { status: 200 });
}
