import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE = "pp_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.APP_SECRET || process.env.X_CLIENT_SECRET;
  if (!s) throw new Error("APP_SECRET is not set");
  return s;
}

export function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

// User-ID-based session token (X-first auth)
export function makeUserSessionToken(userId: number): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `u:${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** When a token with expiry `expSec` was issued (tokens live MAX_AGE seconds), in ms. */
function issuedAtMs(token: string): number {
  return (Number(token.split(".")[1]) - MAX_AGE) * 1000;
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

/**
 * The account a session token belongs to, or null. The account must still exist and the token must
 * postdate its sessionsValidAfter (sign-out revokes every session). Legacy wallet sessions resolve
 * to the wallet's user. Takes the raw cookie value so middleware can use it too.
 */
export async function sessionUserFromToken(token: string | undefined | null): Promise<{ id: number; joinedAt: Date | null } | null> {
  try {
    if (!token) return null;
    const userId = readUserSessionToken(token);
    const wallet = userId ? null : readSessionToken(token);
    if (!userId && !wallet) return null;
    if (!hasDb()) return userId ? { id: userId, joinedAt: null } : null;
    const db = getDb();
    const cols = { id: users.id, joinedAt: users.joinedAt, sessionsValidAfter: users.sessionsValidAfter };
    const [user] = userId
      ? await db.select(cols).from(users).where(eq(users.id, userId)).limit(1)
      : await db.select(cols).from(users).where(eq(users.wallet, wallet as string)).limit(1);
    if (!user) return null;
    if (user.sessionsValidAfter && issuedAtMs(token) < user.sessionsValidAfter.getTime()) return null;
    return { id: user.id, joinedAt: user.joinedAt };
  } catch {
    return null;
  }
}

// Get session user ID (supports both user-ID and wallet sessions).
export async function getSessionUserId(): Promise<number | null> {
  try {
    const store = await cookies();
    return (await sessionUserFromToken(store.get(SESSION_COOKIE)?.value))?.id ?? null;
  } catch {
    return null;
  }
}

/** Sign out everywhere: every session issued so far for this user stops working. */
export async function revokeUserSessions(userId: number): Promise<void> {
  // Tokens carry whole seconds, so any token issued up to this instant reads as earlier and is
  // rejected (a brand-new sign-in within the same second as sign-out just needs a retry).
  await getDb().update(users).set({ sessionsValidAfter: new Date() }).where(eq(users.id, userId));
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
