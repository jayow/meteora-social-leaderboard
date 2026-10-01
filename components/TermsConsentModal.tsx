"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { TermsCheckbox } from "@/components/TermsCheckbox";
import { TERMS_VERSION } from "@/lib/legal";

interface TermsConsentModalProps {
  open: boolean;
  onAccepted: () => void;
  onSignOut: () => void;
}

export function TermsConsentModal({ open, onAccepted, onSignOut }: TermsConsentModalProps) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!checked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termsVersion: TERMS_VERSION }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not save your acceptance");
      }
      onAccepted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save your acceptance");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <Modal onClose={() => undefined} labelledBy="terms-consent-title" className="max-w-md p-6" testId="terms-consent-modal">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-accent">One quick step</p>
          <h2 id="terms-consent-title" className="mt-1 text-2xl font-bold text-fg">Review our terms</h2>
          <p className="mt-2 text-sm leading-6 text-mute">Please accept the current Terms and Privacy Policy to keep using Pool Party. You can sign out instead.</p>
        </div>
        <TermsCheckbox checked={checked} onChange={setChecked} id="required-terms-consent" />
        {error && <p role="alert" className="rounded-xl border border-dn/30 bg-dn/10 px-3 py-2 text-[13px] text-fg">{error}</p>}
        <button type="button" onClick={accept} disabled={!checked || busy} className="btn-primary h-11 w-full">{busy ? "Saving..." : "Accept and continue"}</button>
        <button type="button" onClick={onSignOut} disabled={busy} className="btn-secondary h-11 w-full">Sign out</button>
      </div>
    </Modal>
  );
}
