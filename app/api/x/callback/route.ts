import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import {
  validateOAuthState,
  exchangeCodeForToken,
  fetchXProfile,
  storeXProfileCookie,
  getCallbackUrl,
  oauthReturnUrl,
} from "@/lib/x-oauth";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { setSessionUserId, getSessionUserId } from "@/lib/session";
import { TERMS_VERSION } from "@/lib/legal";

/** Error redirect for a failed sign-in; logs the reason (never tokens) so failures show in the server logs. */
function failRedirect(url: URL): NextResponse {
  console.warn(`[x/callback] sign-in failed: ${url.searchParams.get("message") ?? "unknown"}`);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const callbackUrl = getCallbackUrl(req);
  const baseUrl = new URL(callbackUrl).origin;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const errorDescription = searchParams.get("error_description") || error;
    return failRedirect(
      new URL(`/profile/me?x=error&message=${encodeURIComponent(errorDescription)}`, baseUrl)
    );
  }

  if (!code || !state) {
    return failRedirect(
      new URL("/profile/me?x=error&message=Missing+code+or+state", baseUrl)
    );
  }

  const validated = await validateOAuthState(state);
  if (!validated) {
    return failRedirect(
      new URL("/profile/me?x=error&message=Invalid+state", baseUrl)
    );
  }

  const { verifier, returnTo, termsVersion } = validated;
  if (termsVersion !== TERMS_VERSION) {
    const consentUrl = new URL("/terms", baseUrl);
    consentUrl.searchParams.set("consent", "1");
    consentUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(consentUrl);
  }

  const tokenResult = await exchangeCodeForToken(code, verifier, callbackUrl);
  if (!tokenResult) {
    return failRedirect(
      oauthReturnUrl(returnTo, "x=error&message=Token+exchange+failed", baseUrl)
    );
  }

  const profile = await fetchXProfile(tokenResult.accessToken);
  if (!profile) {
    return failRedirect(
      oauthReturnUrl(returnTo, "x=error&message=Failed+to+fetch+profile", baseUrl)
    );
  }

  await storeXProfileCookie(profile);

  // X-first auth: create or load user by X ID, then set user session
  if (hasDb()) {
    try {
      const db = getDb();
      const xId = profile.id;
      if (!xId) throw new Error("Missing X user ID");
      
      const xHandle = profile.username.replace(/^@/, "");
      
      // Check if we already have a session user (e.g., during join flow)
      const currentUserId = await getSessionUserId();
      
      if (currentUserId) {
        // We're in a join flow or linking X to an existing session
        // Check if this X account is already linked to a different user (by xId or legacy xHandle)
        const [existingByXId] = await db.select().from(users).where(eq(users.xId, xId)).limit(1);
        const [existingByHandle] = await db.select().from(users)
          .where(sql`${users.xId} IS NULL AND lower(${users.xHandle}) = lower(${xHandle})`)
          .limit(1);
        const existingUser = existingByXId || existingByHandle;
        
        if (existingUser && existingUser.id !== currentUserId) {
          return failRedirect(
            oauthReturnUrl(returnTo, "x=error&message=This+X+account+is+already+linked+to+another+Pool+Party+account", baseUrl)
          );
        }
        
        // Update the current user's X profile instead of switching users
        const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
        if (currentUser) {
          await db
            .update(users)
            .set({
              xId,
              xHandle,
              xName: profile.name,
              xAvatarUrl: profile.avatarUrl ? profile.avatarUrl.replace("_normal.", "_400x400.") : null,
            termsVersionAccepted: TERMS_VERSION,
            termsAcceptedAt: new Date(),
            })
            .where(eq(users.id, currentUserId));
          // Keep the current session (don't switch users)
          return NextResponse.redirect(oauthReturnUrl(returnTo, "x=connected", baseUrl));
        }
      }

      // No existing session: X-first auth (find by xId, fall back to legacy xHandle, or create new)
      let [user] = await db.select().from(users).where(eq(users.xId, xId)).limit(1);
      
      if (!user) {
        // Fall back to case-insensitive xHandle match for users with null xId (legacy users)
        [user] = await db.select().from(users)
          .where(sql`${users.xId} IS NULL AND lower(${users.xHandle}) = lower(${xHandle})`)
          .limit(1);
        
        if (user) {
          // Backfill xId for legacy user
          [user] = await db
            .update(users)
            .set({
              xId,
              xHandle,
              xName: profile.name,
              xAvatarUrl: profile.avatarUrl ? profile.avatarUrl.replace("_normal.", "_400x400.") : null,
            termsVersionAccepted: TERMS_VERSION,
            termsAcceptedAt: new Date(),
            })
            .where(eq(users.id, user.id))
            .returning();
        } else {
          // Create new user with X identity (no wallet yet)
          [user] = await db
            .insert(users)
            .values({
              wallet: `temp_${xId}_${Date.now()}`, // Temporary unique value, will be replaced when wallet added
              signupMethod: 'x',
              xId,
              xHandle,
              xName: profile.name,
              xAvatarUrl: profile.avatarUrl ? profile.avatarUrl.replace("_normal.", "_400x400.") : null,
            termsVersionAccepted: TERMS_VERSION,
            termsAcceptedAt: new Date(),
            })
            .returning();
        }
      } else {
        // Update existing user's X profile
        [user] = await db
          .update(users)
          .set({
            xHandle,
            xName: profile.name,
            xAvatarUrl: profile.avatarUrl ? profile.avatarUrl.replace("_normal.", "_400x400.") : null,
            termsVersionAccepted: TERMS_VERSION,
            termsAcceptedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
      }

      // Set user-ID session
      await setSessionUserId(user.id);
    } catch (e) {
      console.error("Failed to create/update user:", e);
      return failRedirect(
        oauthReturnUrl(returnTo, "x=error&message=Failed+to+save+profile", baseUrl)
      );
    }
  }

  return NextResponse.redirect(oauthReturnUrl(returnTo, "x=connected", baseUrl));
}
