import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { inviteCodes, users, type InviteCodeRow, type UserRow } from "@/lib/db/schema";

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

export function isAdmin(wallet: string | null, xHandle?: string | null): boolean {
  const wallets = (process.env.ADMIN_WALLETS || "").split(",").map((w) => w.trim()).filter(Boolean);
  const handles = (process.env.ADMIN_X_HANDLES || "jayowtrades").split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
  
  if (wallet && wallets.includes(wallet)) return true;
  if (xHandle && handles.includes(xHandle.replace(/^@/, "").toLowerCase())) return true;
  
  return false;
}

export function isAdminUser(user: { wallet: string; xHandle: string | null } | null | undefined): boolean {
  if (!user) return false;
  return isAdmin(user.wallet, user.xHandle);
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

export async function redeemCode(wallet: string, code: string, country?: string | null, thesis?: string | null): Promise<{ ok: boolean; user?: UserRow; error?: string }> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [invite] = await tx.select().from(inviteCodes).where(eq(inviteCodes.code, code.toUpperCase())).limit(1);
      if (!invite) return { ok: false, error: "Invalid code" };
      if (invite.disabled) return { ok: false, error: "Code has been disabled" };
      if (invite.uses >= invite.maxUses) return { ok: false, error: "Code has been fully used" };
      const [existing] = await tx.select().from(users).where(eq(users.wallet, wallet)).limit(1);
      if (existing?.joinedAt) return { ok: false, error: "You have already joined" };
      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(sql`${users.joinedAt} IS NOT NULL`);
      const currentCount = countResult?.count ?? 0;
      if (currentCount >= betaCap()) return { ok: false, error: "Beta is full" };
      const nextMemberNumber = currentCount + 1;
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
          updatedAt: sql`now()`,
        })
        .where(eq(users.wallet, wallet))
        .returning();
      if (!user) return { ok: false, error: "Failed to join" };
      return { ok: true, user };
    });
  } catch (err: unknown) {
    console.error("Redeem code error:", err);
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
