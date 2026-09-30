import { NextRequest, NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/session";
import { isAdmin, getMemberCount, betaCap, getAllCodes, getRecentJoins } from "@/lib/invite";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const wallet = await getSessionWallet();
  if (!isAdmin(wallet)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const memberCount = await getMemberCount();
  const cap = betaCap();
  const codes = await getAllCodes();
  const recentJoins = await getRecentJoins(50);
  return NextResponse.json({ memberCount, cap, codes, recentJoins }, { status: 200 });
}
