import { NextRequest, NextResponse } from "next/server";
import { lookupWallet } from "@/lib/wallet-lookup";
import { checkLookup } from "@/lib/wallet-lookup-route";

export const dynamic = "force-dynamic";

/** Any wallet's Meteora stats and open positions (lib/wallet-lookup.ts). Never says who owns it. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ address: string }> }): Promise<NextResponse> {
  const ok = await checkLookup((await ctx.params).address, true);
  if (ok instanceof NextResponse) return ok;
  try {
    return NextResponse.json(await lookupWallet(ok.address), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Meteora, try again" }, { status: 502 });
  }
}
