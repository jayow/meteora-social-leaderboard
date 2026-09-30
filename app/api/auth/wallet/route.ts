import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { isValidWallet } from "@/lib/wallet";
import { loginMessage, setSessionWallet, verifyWalletSignature } from "@/lib/session";
import { toPublicUser, upsertUser } from "@/lib/users";

export const dynamic = "force-dynamic";

interface Body {
  wallet?: string;
  issuedAt?: string;
  signature?: string;
}

/** Verify a signed login message and set an httpOnly session cookie bound to the wallet. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { wallet, issuedAt, signature } = body;
  if (!isValidWallet(wallet) || !issuedAt || !signature) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const ts = Date.parse(issuedAt);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
    return NextResponse.json({ error: "Signature expired, try again" }, { status: 400 });
  }
  if (!verifyWalletSignature(wallet, loginMessage(wallet, issuedAt), signature)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  await setSessionWallet(wallet);
  const user = hasDb() ? toPublicUser(await upsertUser(wallet)) : null;
  return NextResponse.json({ ok: true, wallet, user });
}
