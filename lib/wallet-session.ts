/** localStorage key the Solana WalletProvider uses to remember the last selected wallet. */
export const WALLET_NAME_STORAGE_KEY = "walletName";

/** Forget the remembered wallet so the next sign-in always shows the wallet picker. */
export function forgetRememberedWallet(): void {
  try {
    window.localStorage.removeItem(WALLET_NAME_STORAGE_KEY);
  } catch {
    // localStorage can be unavailable (private mode / blocked storage); nothing to clear then.
  }
}
