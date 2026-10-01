"use client";

import { useCallback, useMemo } from "react";
import type { Adapter, WalletError } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { MeProvider } from "@/components/MeProvider";

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => "https://api.mainnet-beta.solana.com", []);

  // Installed wallets (Phantom, Solflare, OKX, Backpack, ...) are auto-detected via Wallet Standard
  // by WalletProvider. We intentionally do NOT register the legacy PhantomWalletAdapter: it detects
  // `window.phantom` / `window.solana`, which other extensions (e.g. OKX) hijack, so a "Phantom" entry
  // could silently open a different wallet. Solflare's adapter stays for its web-wallet fallback; it is
  // replaced by the Wallet Standard Solflare entry when the extension is installed (no duplicates).
  const wallets = useMemo(() => [new SolflareWalletAdapter()], []);

  // Connection/sign errors (e.g. the user rejecting in the wallet) are surfaced inline by the sign-in
  // picker; log them as warnings instead of the adapter's default console.error.
  const onError = useCallback((error: WalletError, adapter?: Adapter) => {
    console.warn(`[wallet] ${adapter?.name ?? "wallet"}: ${error.message || error.name}`);
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onError}>
        {/* No stock wallet modal: the app's Sign in modal (WalletPicker) is the only wallet UI. */}
        <MeProvider>{children}</MeProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
