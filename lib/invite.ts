import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { inviteCodes, users, type InviteCodeRow, type UserRow } from "@/lib/db/schema";
import { TERMS_VERSION } from "@/lib/legal";

const CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomChar(): string {
  return CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
}

export function generateCode(): string {
  return Array.from({ length: 8 }, randomChar).join("");
}

export function betaCap(): number {
  return Number(process.env.BETA_CAP) || 500;
}

export function invitesPerUser(): number {
  return Number(process.env.INVITES_PER_USER) || 3;
}

const list = (v: string | undefined) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);

/**
 * Admin = Pool Party account id (ADMIN_USER_IDS, default 1 = the founder) or a wallet in
 * ADMIN_WALLETS (signed in by signature). Never by X handle alone: handles can be renamed and
 * re-registered by someone else. ADMIN_X_HANDLES still works but only when explicitly set.
 */
export function isAdminUser(user: { id: number; wallet: string; xHandle: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (list(process.env.ADMIN_USER_IDS || "1").includes(String(user.id))) return true;
  if (list(process.env.ADMIN_WALLETS).includes(user.wallet)) return true;
  const handles = list(process.env.ADMIN_X_HANDLES).map((h) => h.replace(/^@/, "").toLowerCase());
  return Boolean(user.xHandle && handles.includes(user.xHandle.replace(/^@/, "").toLowerCase()));
}

export async function getMemberCount(): Promise<number> {
  const db = getDb();
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.joinedAt} IS NOT NULL`);
  return result?.count ?? 0;
}

export async function findInviteCode(code: string): Promise<InviteCodeRow | null> {
  const db = getDb();
  const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code.toUpperCase())).limit(1);
  return row || null;
}

export async function validateCode(code: string): Promise<{ valid: boolean; reason?: string }> {
  const invite = await findInviteCode(code);
  if (!invite) return { valid: false, reason: "Invalid code" };
  if (invite.disabled) return { valid: false, reason: "Code has been disabled" };
  if (invite.uses >= invite.maxUses) return { valid: false, reason: "Code has been fully used" };
  const count = await getMemberCount();
  if (count >= betaCap()) return { valid: false, reason: "Beta is full" };
  return { valid: true };
}

/**
 * Redeem an invite for an existing (signed-in) user: assigns joined_at and the next dense member
 * number to that user. Never creates a user. Serialized with an advisory lock so concurrent joins
 * can't hand out the same member number or overshoot the beta cap / code uses.
 */
export async function redeemCode(userId: number, code: string, country?: string | null, thesis?: string | null, termsVersion?: string | null): Promise<{ ok: boolean; user?: UserRow; error?: string }> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(7426001)`);
      const [existing] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!existing) return { ok: false, error: "Account not found, sign in again" };
      if (termsVersion !== TERMS_VERSION && existing.termsVersionAccepted !== TERMS_VERSION) {
        return { ok: false, error: "Please accept the current Terms and Privacy Policy before joining" };
      }
      if (existing.joinedAt) return { ok: false, error: "You have already joined" };
      const [invite] = await tx.select().from(inviteCodes).where(eq(inviteCodes.code, code.toUpperCase())).limit(1);
      if (!invite) return { ok: false, error: "Invalid code" };
      if (invite.disabled) return { ok: false, error: "Code has been disabled" };
      if (invite.uses >= invite.maxUses) return { ok: false, error: "Code has been fully used" };
      const [stats] = await tx
        .select({
          count: sql<number>`count(*) filter (where ${users.joinedAt} is not null)::int`,
          maxMember: sql<number>`coalesce(max(${users.memberNumber}), 0)::int`,
        })
        .from(users);
      if ((stats?.count ?? 0) >= betaCap()) return { ok: false, error: "Beta is full" };
      const nextMemberNumber = (stats?.maxMember ?? 0) + 1;
      await tx
        .update(inviteCodes)
        .set({ uses: sql`${inviteCodes.uses} + 1` })
        .where(eq(inviteCodes.id, invite.id));
      const [user] = await tx
        .update(users)
        .set({
          invitedByUserId: invite.createdByUserId,
          inviteCodeId: invite.id,
          joinedAt: sql`now()`,
          memberNumber: nextMemberNumber,
          country: country ?? sql`${users.country}`,
          thesis: thesis ?? sql`${users.thesis}`,
          termsVersionAccepted: TERMS_VERSION,
          termsAcceptedAt: sql`coalesce(${users.termsAcceptedAt}, now())`,
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, userId))
        .returning();
      if (!user) return { ok: false, error: "Failed to join" };
      return { ok: true, user };
    });
  } catch (err: unknown) {
    console.error("Redeem code error:", err instanceof Error ? err.message : err);
    return { ok: false, error: "Transaction failed" };
  }
}

export async function getUserInvites(userId: number): Promise<InviteCodeRow[]> {
  const db = getDb();
  const codes = await db
    .select()
    .from(inviteCodes)
    .where(and(eq(inviteCodes.createdByUserId, userId), eq(inviteCodes.disabled, 0)))
    .orderBy(inviteCodes.createdAt);
  return codes;
}

export async function ensureUserInvites(userId: number): Promise<void> {
  const existing = await getUserInvites(userId);
  const needed = invitesPerUser() - existing.length;
  if (needed <= 0) return;
  const db = getDb();
  const codes = Array.from({ length: needed }, () => ({
    code: generateCode(),
    createdByUserId: userId,
    maxUses: 1,
  }));
  await db.insert(inviteCodes).values(codes).onConflictDoNothing();
}

export async function createAdminCodes(count: number, maxUses = 1): Promise<InviteCodeRow[]> {
  const db = getDb();
  const codes = Array.from({ length: count }, () => ({
    code: generateCode(),
    createdByUserId: null,
    maxUses,
  }));
  return await db.insert(inviteCodes).values(codes).returning();
}

export async function disableCode(codeId: number): Promise<void> {
  const db = getDb();
  await db.update(inviteCodes).set({ disabled: 1 }).where(eq(inviteCodes.id, codeId));
}

export async function enableCode(codeId: number): Promise<void> {
  const db = getDb();
  await db.update(inviteCodes).set({ disabled: 0 }).where(eq(inviteCodes.id, codeId));
}

export async function getAllCodes(): Promise<InviteCodeRow[]> {
  const db = getDb();
  return await db.select().from(inviteCodes).orderBy(inviteCodes.createdAt);
}

export async function getRecentJoins(limit = 50): Promise<UserRow[]> {
  const db = getDb();
  return await db
    .select()
    .from(users)
    .where(sql`${users.joinedAt} IS NOT NULL`)
    .orderBy(sql`${users.joinedAt} DESC`)
    .limit(limit);
}
