import { PublicKey } from "@solana/web3.js";

export function isValidWallet(v: string | null | undefined): v is string {
  if (!v || v.length < 32 || v.length > 44) return false;
  try {
    return PublicKey.isOnCurve(new PublicKey(v).toBytes());
  } catch {
    return false;
  }
}

export function shortWallet(w: string): string {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}
