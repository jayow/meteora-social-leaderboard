import type { UserRow } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/session";

/**
 * Joined beta members are public. An account that hasn't joined yet (no invite redeemed) is
 * visible only to its owner, so a freshly signed-in wallet can still see its own profile.
 */
export async function canViewUser(user: UserRow): Promise<boolean> {
  if (user.joinedAt) return true;
  return (await getSessionUserId()) === user.id;
}
