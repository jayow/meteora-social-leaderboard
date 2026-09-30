import { createHmac, createPublicKey, timingSafeEqual, verify } from "crypto";
import { cookies } from "next/headers";
import { PublicKey } from "@solana/web3.js";
export { loginMessage } from "@/lib/login-message";

export const SESSION_COOKIE = "pp_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.APP_SECRET || process.env.X_CLIENT_SECRET;
  if (!s) throw new Error("APP_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSessionToken(wallet: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${wallet}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [wallet, expStr, sig] = parts;
  const expected = sign(`${wallet}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Date.now() / 1000) return null;
  return wallet;
}

export async function getSessionWallet(): Promise<string | null> {
  const store = await cookies();
  try {
    return readSessionToken(store.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function setSessionWallet(wallet: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, makeSessionToken(wallet), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Verify an ed25519 signature (base64) of `message` by the Solana `wallet`. */
export function verifyWalletSignature(wallet: string, message: string, signatureB64: string): boolean {
  try {
    const raw = Buffer.from(new PublicKey(wallet).toBytes());
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
