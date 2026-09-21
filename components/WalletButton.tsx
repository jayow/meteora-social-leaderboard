"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { linkWallet, unlinkWallet } from "@/lib/storage";

export function WalletButton() {
  const { publicKey, connected } = useWallet();

  useEffect(() => {
    if (connected && publicKey) {
      linkWallet(publicKey.toString());
    } else if (!connected) {
      unlinkWallet();
    }
  }, [connected, publicKey]);

  return <WalletMultiButton />;
}
