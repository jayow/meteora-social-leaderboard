import { NextRequest, NextResponse } from "next/server";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  storeOAuthState,
  getCallbackUrl,
} from "@/lib/x-oauth";
import { TERMS_VERSION } from "@/lib/legal";

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
  const isLinking = req.nextUrl.searchParams.get("link") === "true";
  const termsVersion = req.nextUrl.searchParams.get("termsVersion");
  if (!isLinking && termsVersion !== TERMS_VERSION) {
    const consentUrl = new URL("/terms", req.nextUrl.origin);
    consentUrl.searchParams.set("consent", "1");
    consentUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(consentUrl);
  }
  const returnUrl = new URL(returnTo, req.nextUrl.origin);
  if (returnUrl.origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid returnTo" }, { status: 400 });
  }

  // Generate PKCE verifier and challenge
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  // Store state, verifier, and returnTo in httpOnly cookies
  await storeOAuthState(state, verifier, returnUrl.pathname + returnUrl.search, isLinking ? undefined : TERMS_VERSION);

  // Build callback URL using getCallbackUrl helper (X_CALLBACK_URL env first, then request origin)
  const baseCallbackUrl = getCallbackUrl(req);
  const callbackPath = isLinking ? "/link-callback" : "/callback";
  const callbackUrl = baseCallbackUrl.replace(/\/api\/x\/callback$/, `/api/x${callbackPath}`);

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
