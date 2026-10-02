import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/wallet-proof";

export const dynamic = "force-dynamic";

/** Single-use nonce for the next wallet signature from this browser (see lib/wallet-proof.ts). */
export async function POST(): Promise<NextResponse> {
  const nonce = await issueNonce();
  return NextResponse.json({ nonce }, { headers: { "Cache-Control": "no-store" } });
}
