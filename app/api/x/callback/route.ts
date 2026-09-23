import { NextRequest, NextResponse } from "next/server";
import {
  validateOAuthState,
  exchangeCodeForToken,
  fetchXProfile,
  storeXProfileCookie,
  getCallbackUrl,
} from "@/lib/x-oauth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    const errorDescription = searchParams.get("error_description") || error;
    return NextResponse.redirect(
      new URL(`/profile/me?x=error&message=${encodeURIComponent(errorDescription)}`, req.url)
    );
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Missing+code+or+state", req.url)
    );
  }

  // Validate state and get verifier
  const verifier = await validateOAuthState(state);
  if (!verifier) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Invalid+state", req.url)
    );
  }

  // Exchange code for token
  const callbackUrl = getCallbackUrl(req);
  const tokenResult = await exchangeCodeForToken(code, verifier, callbackUrl);

  if (!tokenResult) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Token+exchange+failed", req.url)
    );
  }

  // Fetch user profile
  const profile = await fetchXProfile(tokenResult.accessToken);

  if (!profile) {
    return NextResponse.redirect(
      new URL("/profile/me?x=error&message=Failed+to+fetch+profile", req.url)
    );
  }

  // Store profile in short-lived cookie for client to consume
  await storeXProfileCookie(profile);

  // Redirect back to profile page with success
  return NextResponse.redirect(new URL("/profile/me?x=connected", req.url));
}
