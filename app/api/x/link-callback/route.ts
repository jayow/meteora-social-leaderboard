import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/session";
import { validateOAuthState, exchangeCodeForToken, fetchXProfile } from "@/lib/x-oauth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const baseUrl = new URL(req.url).origin;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    const errorDescription = searchParams.get("error_description") || error;
    return NextResponse.redirect(
      new URL(`/profile/me?link=error&message=${encodeURIComponent(errorDescription)}`, baseUrl)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/profile/me?link=error&message=Missing+code+or+state", baseUrl)
    );
  }

  const validated = await validateOAuthState(state);
  if (!validated) {
    return NextResponse.redirect(
      new URL("/profile/me?link=error&message=Invalid+state", baseUrl)
    );
  }

  const { verifier, returnTo } = validated;

  // Build callback URL for link flow
  const callbackUrl = new URL("/api/x/link-callback", baseUrl).toString();

  const tokenResult = await exchangeCodeForToken(code, verifier, callbackUrl);
  if (!tokenResult) {
    return NextResponse.redirect(
      new URL(`${returnTo}?link=error&message=Token+exchange+failed`, baseUrl)
    );
  }

  const profile = await fetchXProfile(tokenResult.accessToken);
  if (!profile) {
    return NextResponse.redirect(
      new URL(`${returnTo}?link=error&message=Failed+to+fetch+profile`, baseUrl)
    );
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.redirect(
      new URL(`${returnTo}?link=error&message=Not+signed+in`, baseUrl)
    );
  }

  const db = getDb();
  const xId = profile.id;
  if (!xId) {
    return NextResponse.redirect(
      new URL(`${returnTo}?link=error&message=Missing+X+user+ID`, baseUrl)
    );
  }

  const xHandle = profile.username.replace(/^@/, "");

  // Check if this X account is already linked to another user
  const [existingXUser] = await db.select().from(users).where(eq(users.xId, xId)).limit(1);
  if (existingXUser && existingXUser.id !== userId) {
    return NextResponse.redirect(
      new URL(`${returnTo}?link=error&message=This+X+account+is+already+linked+to+another+user`, baseUrl)
    );
  }

  // Link X account to current user
  try {
    await db
      .update(users)
      .set({
        xId,
        xHandle,
        xName: profile.name,
        xAvatarUrl: profile.avatarUrl ? profile.avatarUrl.replace("_normal.", "_400x400.") : null,
      })
      .where(eq(users.id, userId));

    return NextResponse.redirect(new URL(`${returnTo}?link=success`, baseUrl));
  } catch (e) {
    console.error("Failed to link X account:", e);
    return NextResponse.redirect(
      new URL(`${returnTo}?link=error&message=Failed+to+link+account`, baseUrl)
    );
  }
}
