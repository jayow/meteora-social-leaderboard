import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { isValidWallet } from "@/lib/wallet";
import { trackEvent } from "@/lib/events";

/** Per-member lookup budget: protects the shared Meteora rate limit. */
const PER_MINUTE = 5;
const hits = new Map<number, { start: number; n: number }>();

/**
 * Shared checks for the wallet lookup routes. Members only (the beta gate already requires it).
 * Returns an error response, or the validated address.
 */
export async function checkLookup(address: string, count: boolean): Promise<NextResponse | { address: string }> {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (!isValidWallet(address)) return NextResponse.json({ error: "That isn't a Solana wallet address" }, { status: 400 });
  if (count) {
    const now = Date.now();
    const h = hits.get(userId);
    if (!h || now - h.start > 60_000) hits.set(userId, { start: now, n: 1 });
    else if (++h.n > PER_MINUTE) return NextResponse.json({ error: "Too many lookups, try again in a minute" }, { status: 429 });
    // Never the address: lookups are counted, not logged.
    trackEvent("wallet_lookup", userId);
  }
  return { address };
}
