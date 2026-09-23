"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { linkWallet } from "@/lib/storage";

export function WalletButton({ onChange }: { onChange?: () => void }) {
  const { publicKey, connected } = useWallet();
  
  useEffect(() => {
    if (connected && publicKey) {
      linkWallet(publicKey.toBase58());
      onChange?.();
    }
  }, [connected, publicKey, onChange]);

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    const short = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    return <WalletMultiButton>{short}</WalletMultiButton>;
  }

  return <WalletMultiButton>Connect Wallet</WalletMultiButton>;
}
