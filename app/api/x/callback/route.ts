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
import { setSessionUserId } from "@/lib/session";

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

  const verifier = await validateOAuthState(state);
  if (!verifier) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Invalid+state", baseUrl)
    );
  }

  const tokenResult = await exchangeCodeForToken(code, verifier, callbackUrl);
  if (!tokenResult) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Token+exchange+failed", baseUrl)
    );
  }

  const profile = await fetchXProfile(tokenResult.accessToken);
  if (!profile) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Failed+to+fetch+profile", baseUrl)
    );
  }

  await storeXProfileCookie(profile);

  // X-first auth: create or load user by X ID, then set user session
  if (hasDb()) {
    try {
      const db = getDb();
      const xId = profile.id;
      if (!xId) throw new Error("Missing X user ID");

      // Find or create user by X ID
      let [user] = await db.select().from(users).where(eq(users.xId, xId)).limit(1);
      
      if (!user) {
        // Create new user with X identity (no wallet yet)
        const xHandle = profile.username.replace(/^@/, "");
        [user] = await db
          .insert(users)
          .values({
            wallet: `temp_${xId}_${Date.now()}`, // Temporary unique value, will be replaced when wallet added
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
            xHandle: profile.username.replace(/^@/, ""),
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
        new URL("/profile/me?x=error&message=Failed+to+save+profile", baseUrl)
      );
    }
  }

  return NextResponse.redirect(new URL("/profile/me?x=connected", baseUrl));
}
