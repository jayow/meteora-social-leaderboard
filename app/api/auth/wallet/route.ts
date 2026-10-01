import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { userWallets, users } from "@/lib/db/schema";
import { isValidWallet } from "@/lib/wallet";
import { loginMessage, setSessionUserId, verifyWalletSignature } from "@/lib/session";
import { toPublicUser, upsertUser } from "@/lib/users";
import { TERMS_VERSION } from "@/lib/legal";

export const dynamic = "force-dynamic";

interface Body {
  wallet?: string;
  issuedAt?: string;
  signature?: string;
  termsVersion?: string;
}

/** Verify a signed login message and set an httpOnly session cookie bound to the user. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { wallet, issuedAt, signature, termsVersion } = body;
  if (termsVersion !== TERMS_VERSION) return NextResponse.json({ error: "Please accept the current Terms and Privacy Policy" }, { status: 400 });
  if (!isValidWallet(wallet) || !issuedAt || !signature) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const ts = Date.parse(issuedAt);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 10 * 60 * 1000) {
    return NextResponse.json({ error: "Signature expired, try again" }, { status: 400 });
  }
  if (!verifyWalletSignature(wallet, loginMessage(wallet, issuedAt), signature)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  
  if (!hasDb()) {
    return NextResponse.json({ ok: true, wallet, user: null });
  }

  const db = getDb();
  let user = null;

  const [linkedWallet] = await db.select().from(userWallets).where(eq(userWallets.address, wallet)).limit(1);
  if (linkedWallet) {
    const [owner] = await db.select().from(users).where(eq(users.id, linkedWallet.userId)).limit(1);
    user = owner;
  } else {
    const [primaryUser] = await db.select().from(users).where(eq(users.wallet, wallet)).limit(1);
    user = primaryUser || (await upsertUser(wallet));
  }

  await db.update(users).set({ termsVersionAccepted: TERMS_VERSION, termsAcceptedAt: new Date() }).where(eq(users.id, user.id));
  await setSessionUserId(user.id);
  return NextResponse.json({ ok: true, user: toPublicUser(user) });
}
