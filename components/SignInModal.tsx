"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { Modal } from "@/components/Modal";
import { XIcon } from "@/components/ui";
import { WalletPicker } from "@/components/WalletPicker";
import { proveWallet } from "@/lib/wallet-proof-client";
import { TermsCheckbox } from "@/components/TermsCheckbox";
import { TERMS_VERSION } from "@/lib/legal";
import { forgetRememberedWallet } from "@/lib/wallet-session";

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
  const { wallet, select, connect, disconnect, connected, connecting, publicKey, signMessage, signIn: walletSignIn } = useWallet();
  const [step, setStep] = useState<SignInStep>(initialStep);
  const [pending, setPending] = useState<WalletName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const signingRef = useRef(false);
  const matchedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setPending(null);
    setError(null);
    setTermsAccepted(false);
  }, [open, initialStep]);

  const signIn = useCallback(async (): Promise<void> => {
    if (!termsAccepted) {
      setError("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    if (!publicKey) return;
    if (!signMessage && !walletSignIn) {
      setError("This wallet can't sign messages. Pick another wallet.");
      return;
    }
    const proof = await proveWallet({
      address: publicKey.toBase58(),
      statement: "Sign in to Pool Party. This is free and does not send a transaction.",
      signIn: walletSignIn,
      signMessage,
    });
    const res = await fetch("/api/auth/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof, termsVersion: TERMS_VERSION }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Sign in failed");
    }
    // The session cookie identifies the user from here on: don't leave the wallet connected to the site.
    await disconnect().catch(() => undefined);
    forgetRememberedWallet();
    onSuccess?.();
    onClose();
    window.location.reload();
  }, [publicKey, signMessage, walletSignIn, disconnect, onSuccess, onClose, termsAccepted]);

  // Closing without signing in also drops any connection made in this modal.
  const close = useCallback(() => {
    if (connected) void disconnect().catch(() => undefined);
    forgetRememberedWallet();
    onClose();
  }, [connected, disconnect, onClose]);

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
    if (!termsAccepted) {
      setError("Please accept the Terms and Privacy Policy to continue.");
      return;
    }
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/x/login?termsVersion=${encodeURIComponent(TERMS_VERSION)}&returnTo=${encodeURIComponent(returnTo)}`;
  };

  if (!open) return null;

  return (
    <Modal onClose={close} labelledBy="signin-title" className="max-w-md p-6">
      {step === "methods" ? (
        <>
          <div className="mb-6 text-center">
            <h2 id="signin-title" className="text-xl font-semibold tracking-tight text-fg">Sign in</h2>
            <p className="mt-1 text-base text-mute">Choose how you want to sign in.</p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("wallets");
              }}
              className="btn-primary h-11 w-full gap-2"
            >
              <WalletIcon />
              Connect wallet
            </button>

            <button
              type="button"
              onClick={handleXConnect}
              className="btn-secondary h-11 w-full gap-2"
            >
              <XIcon className="h-4 w-4" />
              Continue with X
            </button>
          </div>

          <p className="mt-4 text-center text-sm text-mute">
            Pool Party only asks your wallet to sign a free message. We will never ask you to approve a transaction.
          </p>

          <div className="tile mt-5 p-3">
            <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} id="signin-terms-consent" />
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-mute transition hover:bg-surface-raised hover:text-fg"
                aria-label="Back"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3.5L5.5 8l4.5 4.5" />
                </svg>
              </button>
            )}
            <div className="min-w-0">
              <h2 id="signin-title" className="text-xl font-semibold tracking-tight text-fg">
                {initialStep === "wallets" ? "Change wallet" : "Connect a wallet"}
              </h2>
              <p className="mt-0.5 text-base text-mute">Pick a wallet, then sign a free message to verify. We never ask you to approve a transaction.</p>
            </div>
          </div>
          <WalletPicker busyName={pending} onPick={handlePick} />
          <div className="tile mt-4 p-3">
            <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} id="signin-terms-consent-wallets" />
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-tile border border-dn/30 bg-dn/10 px-3 py-2.5 text-base text-fg">
          {error}
        </p>
      )}

      <button type="button" onClick={close} className="btn-ghost mt-4 w-full">
        Cancel
      </button>
    </Modal>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H15v2.5" />
      <path d="M3 6.5v8A1.5 1.5 0 0 0 4.5 16h12a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-12A1.5 1.5 0 0 1 3 6.5z" />
      <circle cx="13.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
