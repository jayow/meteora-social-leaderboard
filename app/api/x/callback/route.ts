import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  validateOAuthState,
  exchangeCodeForToken,
  fetchXProfile,
  storeXProfileCookie,
  getCallbackUrl,
} from "@/lib/x-oauth";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { setSessionUserId, getSessionUserId } from "@/lib/session";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const callbackUrl = getCallbackUrl(req);
  const baseUrl = new URL(callbackUrl).origin;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const errorDescription = searchParams.get("error_description") || error;
    return NextResponse.redirect(
      new URL(`/profile/me?x=error&message=${encodeURIComponent(errorDescription)}`, baseUrl)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Missing+code+or+state", baseUrl)
    );
  }

  const validated = await validateOAuthState(state);
  if (!validated) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Invalid+state", baseUrl)
    );
  }

  const { verifier, returnTo } = validated;

  const tokenResult = await exchangeCodeForToken(code, verifier, callbackUrl);
  if (!tokenResult) {
    return NextResponse.redirect(
      new URL(`${returnTo}?x=error&message=Token+exchange+failed`, baseUrl)
    );
  }

  const profile = await fetchXProfile(tokenResult.accessToken);
  if (!profile) {
    return NextResponse.redirect(
      new URL(`${returnTo}?x=error&message=Failed+to+fetch+profile`, baseUrl)
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
        // Update the current user's X profile instead of switching users
        const [currentUser] = await db.select().from(users).where(eq(users.id, currentUserId)).limit(1);
        if (currentUser) {
          const [updated] = await db
            .update(users)
            .set({
              xId,
              xHandle,
              xName: profile.name,
              xAvatarUrl: profile.avatarUrl ? profile.avatarUrl.replace("_normal.", "_400x400.") : null,
            })
            .where(eq(users.id, currentUserId))
            .returning();
          // Keep the current session (don't switch users)
          return NextResponse.redirect(new URL(`${returnTo}?x=connected`, baseUrl));
        }
      }

      // No existing session: X-first auth (create or find user by X ID)
      let [user] = await db.select().from(users).where(eq(users.xId, xId)).limit(1);
      
      if (!user) {
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
          })
          .returning();
      } else {
        // Update existing user's X profile
        [user] = await db
          .update(users)
          .set({
            xHandle,
            xName: profile.name,
            xAvatarUrl: profile.avatarUrl ? profile.avatarUrl.replace("_normal.", "_400x400.") : null,
          })
          .where(eq(users.id, user.id))
          .returning();
      }

      // Set user-ID session
      await setSessionUserId(user.id);
    } catch (e) {
      console.error("Failed to create/update user:", e);
      return NextResponse.redirect(
        new URL(`${returnTo}?x=error&message=Failed+to+save+profile`, baseUrl)
      );
    }
  }

  return NextResponse.redirect(new URL(`${returnTo}?x=connected`, baseUrl));
}
