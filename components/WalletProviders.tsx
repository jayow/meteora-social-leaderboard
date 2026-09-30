"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { MeProvider } from "@/components/MeProvider";

export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => "https://api.mainnet-beta.solana.com", []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <MeProvider>{children}</MeProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
