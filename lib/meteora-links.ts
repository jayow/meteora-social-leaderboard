/**
 * Meteora referral link helper
 * All outbound links to Meteora must go through Jay's referral code
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
