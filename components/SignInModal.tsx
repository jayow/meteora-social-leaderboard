"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { XIcon } from "@/components/ui";
import { loginMessage } from "@/lib/login-message";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SignInModal({ open, onClose, onSuccess }: SignInModalProps) {
  const { publicKey, connected, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const ref = useRef<HTMLDivElement>(null);
  const [signingWallet, setSigningWallet] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  const handleWalletConnect = async () => {
    if (!connected || !publicKey || !signMessage) {
      setVisible(true);
      return;
    }

    setSigningWallet(true);
    try {
      const wallet = publicKey.toBase58();
      const issuedAt = new Date().toISOString();
      const sig = await signMessage(new TextEncoder().encode(loginMessage(wallet, issuedAt)));
      const res = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, issuedAt, signature: toBase64(sig) }),
      });
      
      if (res.ok) {
        onSuccess?.();
        onClose();
        window.location.reload();
      } else {
        const data = (await res.json()) as { error?: string };
        alert(data.error || "Sign in failed");
      }
    } catch (err) {
      console.error("Wallet sign in error:", err);
      alert("Failed to sign message. Please try again.");
    } finally {
      setSigningWallet(false);
    }
  };

  const handleXConnect = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/x/login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div ref={ref} className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1A1623] p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-white">Sign in</h2>
          <p className="mt-2 text-sm text-white/60">Choose your sign in method</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleWalletConnect}
            disabled={signingWallet}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-orange/30 bg-orange text-base font-semibold text-white shadow-lg shadow-orange/25 transition hover:bg-orange-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-xl">👛</span>
            {signingWallet ? "Signing..." : "Connect wallet"}
          </button>

          <button
            type="button"
            onClick={handleXConnect}
            className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/[.12] text-base font-semibold text-white transition hover:bg-white/[.18]"
          >
            <XIcon className="h-4 w-4" />
            Continue with X
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full text-sm text-white/60 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
