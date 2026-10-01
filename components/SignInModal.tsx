"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { Modal } from "@/components/Modal";
import { XIcon } from "@/components/ui";
import { WalletPicker } from "@/components/WalletPicker";
import { loginMessage } from "@/lib/login-message";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export type SignInStep = "methods" | "wallets";

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Open straight on the wallet picker (used by "Change wallet"). */
  initialStep?: SignInStep;
}

export function SignInModal({ open, onClose, onSuccess, initialStep = "methods" }: SignInModalProps) {
  const { wallet, select, connect, connected, connecting, publicKey, signMessage } = useWallet();
  const [step, setStep] = useState<SignInStep>(initialStep);
  const [pending, setPending] = useState<WalletName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signingRef = useRef(false);
  const matchedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setPending(null);
    setError(null);
  }, [open, initialStep]);

  const signIn = useCallback(async (): Promise<void> => {
    if (!publicKey) return;
    if (!signMessage) {
      setError("This wallet can't sign messages. Pick another wallet.");
      return;
    }
    const wallet58 = publicKey.toBase58();
    const issuedAt = new Date().toISOString();
    const sig = await signMessage(new TextEncoder().encode(loginMessage(wallet58, issuedAt)));
    const res = await fetch("/api/auth/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet58, issuedAt, signature: toBase64(sig) }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Sign in failed");
    }
    onSuccess?.();
    onClose();
    window.location.reload();
  }, [publicKey, signMessage, onSuccess, onClose]);

  // Drive the explicitly picked wallet: select -> connect -> sign. Nothing happens until the user picks.
  useEffect(() => {
    if (!pending) {
      matchedRef.current = false;
      return;
    }
    if (wallet?.adapter.name !== pending) {
      // The adapter resets the selection when a connection attempt fails or is rejected.
      if (matchedRef.current) {
        matchedRef.current = false;
        setPending(null);
        setError("Wallet connection was cancelled.");
      }
      return;
    }
    matchedRef.current = true;
    if (!connected) {
      if (!connecting) {
        connect().catch((err: unknown) => {
          setPending(null);
          setError(errorMessage(err, "Couldn't connect to the wallet."));
        });
      }
      return;
    }
    if (publicKey && !signingRef.current) {
      signingRef.current = true;
      signIn()
        .catch((err: unknown) => setError(errorMessage(err, "Failed to sign message. Please try again.")))
        .finally(() => {
          signingRef.current = false;
          setPending(null);
        });
    }
  }, [pending, wallet, connected, connecting, publicKey, connect, signIn]);

  const handlePick = (name: WalletName) => {
    setError(null);
    setPending(name);
    if (wallet?.adapter.name !== name) select(name);
  };

  const handleXConnect = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/x/login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  if (!open) return null;

  return (
    <Modal onClose={onClose} labelledBy="signin-title" className="max-w-md p-6">
      {step === "methods" ? (
        <>
          <div className="mb-6 text-center">
            <h2 id="signin-title" className="text-2xl font-bold text-fg">Sign in</h2>
            <p className="mt-2 text-sm text-mute">Choose your sign in method</p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("wallets");
              }}
              className="btn-primary h-14 w-full gap-3 !rounded-2xl text-base"
            >
              <span className="text-xl">👛</span>
              Connect wallet
            </button>

            <button
              type="button"
              onClick={handleXConnect}
              className="btn-secondary h-14 w-full gap-3 !rounded-2xl text-base"
            >
              <XIcon className="h-4 w-4" />
              Continue with X
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-3">
            {initialStep === "methods" && (
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setError(null);
                  setStep("methods");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-mute transition hover:bg-surface-raised hover:text-fg"
                aria-label="Back"
              >
                ←
              </button>
            )}
            <div>
              <h2 id="signin-title" className="text-xl font-bold text-fg">
                {initialStep === "wallets" ? "Change wallet" : "Connect a wallet"}
              </h2>
              <p className="mt-0.5 text-[13px] text-mute">Pick a wallet, then sign a free message to verify.</p>
            </div>
          </div>
          <WalletPicker busyName={pending} onPick={handlePick} />
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-dn/30 bg-dn/10 px-3 py-2 text-[13px] text-fg">
          {error}
        </p>
      )}

      <button type="button" onClick={onClose} className="mt-6 w-full text-sm text-mute hover:text-fg">
        Cancel
      </button>
    </Modal>
  );
}
