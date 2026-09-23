import { cookies } from "next/headers";

export interface XProfile {
  username: string;
  name: string;
  avatarUrl: string;
}

/**
 * Generate a random string for OAuth state/verifier
 */
function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

/**
 * Generate PKCE code verifier
 */
export function generateCodeVerifier(): string {
  return randomString(128);
}

/**
 * Generate PKCE code challenge from verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Generate OAuth state parameter
 */
export function generateState(): string {
  return randomString(32);
}

/**
 * Build the callback URL from environment or request
 */
export function getCallbackUrl(req: Request): string {
  // Use explicit env var if set
  if (process.env.X_CALLBACK_URL) {
    return process.env.X_CALLBACK_URL;
  }

  // Fall back to constructing from VERCEL_URL, RAILWAY_PUBLIC_DOMAIN, or request host
  const host =
    process.env.VERCEL_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : undefined) ||
    new URL(req.url).origin;

  return `${host}/api/x/callback`;
}

/**
 * Store OAuth state and verifier in httpOnly cookies
 */
export async function storeOAuthState(state: string, verifier: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("x_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
  cookieStore.set("x_oauth_verifier", verifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });
}

/**
 * Retrieve and validate OAuth state from cookies
 */
export async function validateOAuthState(receivedState: string): Promise<string | null> {
  const cookieStore = await cookies();
  const storedState = cookieStore.get("x_oauth_state")?.value;
  const verifier = cookieStore.get("x_oauth_verifier")?.value;

  if (!storedState || !verifier || storedState !== receivedState) {
    return null;
  }

  // Clear state cookie after validation
  cookieStore.delete("x_oauth_state");

  return verifier;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  verifier: string,
  callbackUrl: string
): Promise<{ accessToken: string; refreshToken?: string } | null> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    code_verifier: verifier,
  });

  const authHeader = btoa(`${clientId}:${clientSecret}`);

  try {
    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authHeader}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      console.error("Token exchange failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  } catch (error) {
    console.error("Token exchange error:", error);
    return null;
  }
}

/**
 * Fetch user profile from X API
 */
export async function fetchXProfile(accessToken: string): Promise<XProfile | null> {
  try {
    const response = await fetch(
      "https://api.x.com/2/users/me?user.fields=profile_image_url,username,name",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Profile fetch failed:", await response.text());
      return null;
    }

    const data = await response.json();
    const user = data.data;

    return {
      username: user.username,
      name: user.name,
      avatarUrl: user.profile_image_url || "",
    };
  } catch (error) {
    console.error("Profile fetch error:", error);
    return null;
  }
}

/**
 * Store verified X profile in a short-lived cookie for client to consume
 */
export async function storeXProfileCookie(profile: XProfile): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("x_profile", JSON.stringify(profile), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60, // 1 minute - just enough for client to read
    path: "/",
  });
}

/**
 * Retrieve and clear X profile from cookie
 */
export async function consumeXProfileCookie(): Promise<XProfile | null> {
  const cookieStore = await cookies();
  const profileCookie = cookieStore.get("x_profile");

  if (!profileCookie) {
    return null;
  }

  try {
    const profile = JSON.parse(profileCookie.value) as XProfile;
    // Clear the cookie after reading
    cookieStore.delete("x_profile");
    return profile;
  } catch {
    return null;
  }
}
