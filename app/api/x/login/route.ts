import { NextRequest, NextResponse } from "next/server";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  storeOAuthState,
  getCallbackUrl,
} from "@/lib/x-oauth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId = process.env.X_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "X OAuth not configured. X_CLIENT_ID is missing." },
      { status: 503 }
    );
  }

  // Capture returnTo (same-origin paths only)
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/profile/me";
  const returnUrl = new URL(returnTo, req.nextUrl.origin);
  if (returnUrl.origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid returnTo" }, { status: 400 });
  }

  // Generate PKCE verifier and challenge
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  // Store state, verifier, and returnTo in httpOnly cookies
  await storeOAuthState(state, verifier, returnUrl.pathname + returnUrl.search);

  // Build callback URL
  const callbackUrl = getCallbackUrl(req);

  // Build authorization URL
  const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set("scope", "users.read tweet.read");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authUrl.toString());
}
