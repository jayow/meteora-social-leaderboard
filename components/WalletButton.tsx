"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { linkWallet, unlinkWallet } from "@/lib/storage";

export function WalletButton({ onChange }: { onChange?: () => void }) {
  const { publicKey, connected } = useWallet();

  useEffect(() => {
    if (connected && publicKey) {
      linkWallet(publicKey.toBase58());
    } else if (!connected) {
      unlinkWallet();
    }
    onChange?.();
  }, [connected, publicKey, onChange]);

  return <WalletMultiButton>Connect Wallet</WalletMultiButton>;
}
