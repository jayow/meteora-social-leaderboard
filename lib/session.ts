import { createHmac, createPublicKey, timingSafeEqual, verify } from "crypto";
import { cookies } from "next/headers";
import { PublicKey } from "@solana/web3.js";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

// User-ID-based session token (X-first auth)
export function makeUserSessionToken(userId: number): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `u:${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function readUserSessionToken(token: string | undefined | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userPart, expStr, sig] = parts;
  if (!userPart.startsWith("u:")) return null;
  const expected = sign(`${userPart}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Date.now() / 1000) return null;
  const userId = Number(userPart.slice(2));
  return Number.isFinite(userId) ? userId : null;
}

// Legacy wallet-based session token (backward compat)
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
  if (wallet.startsWith("u:")) return null; // Skip user-id sessions
  const expected = sign(`${wallet}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expStr) < Date.now() / 1000) return null;
  return wallet;
}

// Get session user ID (supports both user-ID and wallet sessions)
export async function getSessionUserId(): Promise<number | null> {
  const store = await cookies();
  try {
    const token = store.get(SESSION_COOKIE)?.value;
    const userId = readUserSessionToken(token);
    if (userId) return userId;
    
    // Upgrade legacy wallet session to user ID if DB available
    const wallet = readSessionToken(token);
    if (wallet && hasDb()) {
      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.wallet, wallet)).limit(1);
      if (user) return user.id;
    }
    return null;
  } catch {
    return null;
  }
}

// Get full user record from session (supports both user-ID and wallet sessions)
export async function getSessionUser(): Promise<typeof users.$inferSelect | null> {
  if (!hasDb()) return null;
  const userId = await getSessionUserId();
  if (!userId) return null;
  
  try {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user || null;
  } catch {
    return null;
  }
}

// Legacy: get wallet from session (for backward compat)
export async function getSessionWallet(): Promise<string | null> {
  const store = await cookies();
  try {
    return readSessionToken(store.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function setSessionUserId(userId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, makeUserSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
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
