import { NextRequest, NextResponse } from "next/server";
import {
  validateOAuthState,
  exchangeCodeForToken,
  fetchXProfile,
  storeXProfileCookie,
  getCallbackUrl,
} from "@/lib/x-oauth";
import { hasDb } from "@/lib/db";
import { getSessionWallet } from "@/lib/session";
import { upsertUser } from "@/lib/users";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  // Build redirects from the public callback origin (req.url may carry an internal host behind the proxy)
  const callbackUrl = getCallbackUrl(req);
  const baseUrl = new URL(callbackUrl).origin;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    const errorDescription = searchParams.get("error_description") || error;
    return NextResponse.redirect(
      new URL(`/profile/me?x=error&message=${encodeURIComponent(errorDescription)}`, baseUrl)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Missing+code+or+state", baseUrl)
    );
  }

  // Validate state and get verifier
  const verifier = await validateOAuthState(state);
  if (!verifier) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Invalid+state", baseUrl)
    );
  }

  // Exchange code for token
  const tokenResult = await exchangeCodeForToken(code, verifier, callbackUrl);

  if (!tokenResult) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Token+exchange+failed", baseUrl)
    );
  }

  // Fetch user profile
  const profile = await fetchXProfile(tokenResult.accessToken);

  if (!profile) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Failed+to+fetch+profile", baseUrl)
    );
  }

  // Store profile in short-lived cookie for client to consume
  await storeXProfileCookie(profile);

  // Persist the verified X identity server-side on the signed-in wallet's row.
  const wallet = await getSessionWallet();
  if (wallet && hasDb()) {
    try {
      await upsertUser(wallet, {
        xId: profile.id ?? null,
        xHandle: profile.username,
        xName: profile.name,
        xAvatarUrl: profile.avatarUrl ? profile.avatarUrl.replace("_normal.", "_400x400.") : null,
      });
    } catch (e) {
      console.error("Failed to persist X profile:", e);
    }
  }

  // Redirect back to profile page with success
  return NextResponse.redirect(new URL("/profile/me?x=connected", baseUrl));
}
