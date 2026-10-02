import type { SolanaSignInInput, SolanaSignInOutput } from "@solana/wallet-standard-features";
import { createSignInMessage } from "@solana/wallet-standard-util";

/** Matches `WalletProof` in lib/wallet-proof.ts (server). */
export interface WalletProofBody {
  input: SolanaSignInInput;
  signedMessage: string;
  signature: string;
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * Prove control of `address` with a Sign-In With Solana message for this site and a fresh server
 * nonce. Uses the wallet's `signIn` when it has one (the wallet checks the domain itself), otherwise
 * signs the same standard message text. Free; never a transaction.
 */
export async function proveWallet(opts: {
  address: string;
  statement: string;
  signIn?: (input?: SolanaSignInInput) => Promise<SolanaSignInOutput>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}): Promise<WalletProofBody> {
  const res = await fetch("/api/auth/nonce", { method: "POST", cache: "no-store" });
  if (!res.ok) throw new Error("Couldn't start sign-in, try again");
  const { nonce } = (await res.json()) as { nonce: string };
  const input: SolanaSignInInput & { domain: string; address: string } = {
    domain: window.location.host,
    address: opts.address,
    statement: opts.statement,
    uri: window.location.origin,
    version: "1",
    nonce,
    issuedAt: new Date().toISOString(),
  };
  if (opts.signIn) {
    const out = await opts.signIn(input);
    if (out.account.address !== opts.address) throw new Error("The wallet signed with a different account");
    return { input, signedMessage: toB64(out.signedMessage), signature: toB64(out.signature) };
  }
  if (!opts.signMessage) throw new Error("This wallet can't sign messages. Try Phantom or Solflare.");
  const message = createSignInMessage(input);
  const signature = await opts.signMessage(message);
  return { input, signedMessage: toB64(message), signature: toB64(signature) };
}
