import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";
import type { SolanaSignInInput } from "@solana/wallet-standard-features";
import { verifySignIn } from "@solana/wallet-standard-util";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { walletNonces } from "@/lib/db/schema";
import { sign } from "@/lib/session";
import { isValidWallet } from "@/lib/wallet";

/**
 * Wallet ownership proofs (sign-in, linking, adding a wallet) use Sign-In With Solana messages bound
 * to this site's domain and a single-use, server-issued nonce, so a signature obtained on another
 * site, or replayed, is rejected. Wallets with `signIn` check the domain against the page origin.
 */

const NONCE_COOKIE = "pp_wallet_nonce";
const NONCE_TTL_S = 10 * 60;

/** Body field every wallet-proof endpoint accepts. */
export interface WalletProof {
  input: SolanaSignInInput;
  /** base64 */
  signedMessage: string;
  /** base64 */
  signature: string;
}

export type ProofResult = { ok: true; address: string } | { ok: false; status: number; error: string };

/**
 * Issue a nonce for the next proof from this browser: recorded server-side (deleted on use, so a
 * proof can never be replayed) and bound to this browser by a signed httpOnly cookie. 10 minutes.
 */
export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + NONCE_TTL_S * 1000);
  const db = getDb();
  await db.delete(walletNonces).where(lt(walletNonces.expiresAt, new Date()));
  await db.insert(walletNonces).values({ nonce, expiresAt });
  const payload = `${nonce}.${Math.floor(expiresAt.getTime() / 1000)}`;
  (await cookies()).set(NONCE_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: NONCE_TTL_S,
    path: "/api",
  });
  return nonce;
}

async function takeNonce(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(NONCE_COOKIE)?.value;
  // Single use: gone whatever the outcome.
  store.delete({ name: NONCE_COOKIE, path: "/api" });
  if (!raw) return null;
  const [nonce, expStr, sig] = raw.split(".");
  if (!nonce || !expStr || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${nonce}.${expStr}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Date.now() / 1000) return null;
  // Consume server-side: only the first use of a nonce can succeed.
  const used = await getDb()
    .delete(walletNonces)
    .where(and(eq(walletNonces.nonce, nonce), gt(walletNonces.expiresAt, new Date())))
    .returning({ nonce: walletNonces.nonce });
  return used.length === 1 ? nonce : null;
}

/** The host the visitor is on (behind Railway's proxy req.url is the container's localhost). */
function publicHost(req: NextRequest): string {
  return (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
}

function isProof(v: unknown): v is WalletProof {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<WalletProof>;
  return Boolean(p.input && typeof p.input === "object" && typeof p.signedMessage === "string" && typeof p.signature === "string");
}

/** Check a wallet proof: domain, nonce (consumed), freshness, then the SIWS signature. */
export async function verifyWalletProof(req: NextRequest, proof: unknown): Promise<ProofResult> {
  if (!isProof(proof)) return { ok: false, status: 400, error: "Missing wallet signature" };
  const { input } = proof;
  const nonce = await takeNonce();
  const address = input.address;
  if (!isValidWallet(address)) return { ok: false, status: 400, error: "Invalid wallet" };
  if (input.domain !== publicHost(req)) return { ok: false, status: 400, error: "Signature is for a different site" };
  if (!nonce || input.nonce !== nonce) return { ok: false, status: 400, error: "Sign-in expired, try again" };
  const ts = input.issuedAt ? Date.parse(input.issuedAt) : NaN;
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > NONCE_TTL_S * 1000) {
    return { ok: false, status: 400, error: "Sign-in expired, try again" };
  }
  try {
    const ok = verifySignIn(input, {
      account: { address, publicKey: new PublicKey(address).toBytes(), chains: [], features: [] },
      signedMessage: new Uint8Array(Buffer.from(proof.signedMessage, "base64")),
      signature: new Uint8Array(Buffer.from(proof.signature, "base64")),
    });
    if (!ok) return { ok: false, status: 401, error: "Bad signature" };
  } catch {
    return { ok: false, status: 401, error: "Bad signature" };
  }
  return { ok: true, address };
}
