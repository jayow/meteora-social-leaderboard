/**
 * Meteora referral link helper
 * All outbound links to Meteora must go through Jay's referral code. Each member's first Meteora link
 * carries it; later ones are stripped at click time (stripUsedReferral, wired in AppShell), so members
 * who already have a referrer aren't nagged on every link.
 * 
 * Meteora's frontend uses ?referral_code= (NOT ?ref=)
 * /ref/[code] redirects to /referral?referral_code=[code]
 */

const REF_CODE = process.env.NEXT_PUBLIC_METEORA_REF || "RXXEVMGP7N";

/**
 * Generate a Meteora pool URL with referral code
 * @param address - Pool address
 * @param protocol - Pool protocol type (dlmm or damm)
 * @returns Full URL with referral_code parameter
 */
export function meteoraPoolUrl(address: string, protocol?: string | null): string {
  const poolType = protocol === "dlmm" || !protocol ? "dlmm" : "pools";
  return `https://app.meteora.ag/${poolType}/${address}?referral_code=${REF_CODE}`;
}

/**
 * Generate Meteora homepage URL with referral code
 * @returns Full URL with referral code
 */
export function meteoraHomeUrl(): string {
  return `https://app.meteora.ag/ref/${REF_CODE}`;
}

const USED_KEY = "pp_meteora_ref_used";

/** Browser-only: whether this member has already opened a Meteora link with our code. */
export function referralUsed(): boolean {
  try {
    return window.localStorage.getItem(USED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markReferralUsed(): void {
  try {
    window.localStorage.setItem(USED_KEY, "1");
  } catch {
    // storage blocked: the server flag still covers signed-in members
  }
}

/** The same Meteora URL without our referral, or null when it has none. */
export function withoutReferral(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== "app.meteora.ag") return null;
  if (url.pathname.startsWith("/ref/")) return `${url.origin}/`;
  if (!url.searchParams.has("referral_code")) return null;
  url.searchParams.delete("referral_code");
  return url.toString();
}
