const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Cheap client-side check; the server does the real on-curve validation. */
export function isValidWalletClient(v: string | null | undefined): v is string {
  return Boolean(v && BASE58.test(v));
}
