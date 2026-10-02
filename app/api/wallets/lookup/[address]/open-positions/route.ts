import { NextRequest, NextResponse } from "next/server";
import { lookupWallet } from "@/lib/wallet-lookup";
import { checkLookup } from "@/lib/wallet-lookup-route";

export const dynamic = "force-dynamic";

/** The lookup's open positions in the /api/users/:id/open-positions shape (served from the same cache). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ address: string }> }): Promise<NextResponse> {
  const ok = await checkLookup((await ctx.params).address, false);
  if (ok instanceof NextResponse) return ok;
  try {
    return NextResponse.json((await lookupWallet(ok.address)).openPositions, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Meteora, try again" }, { status: 502 });
  }
}
