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
          <h2 id="terms-consent-title" className="text-xl font-semibold tracking-tight text-fg">Review our terms</h2>
          <p className="mt-1 text-base text-mute">One quick step: please accept the current Terms and Privacy Policy to keep using Pool Party. You can sign out instead.</p>
        </div>
        <div className="tile p-3">
          <TermsCheckbox checked={checked} onChange={setChecked} id="required-terms-consent" />
        </div>
        {error && <p role="alert" className="rounded-tile border border-dn/30 bg-dn/10 px-3 py-2.5 text-base text-fg">{error}</p>}
        <button type="button" onClick={accept} disabled={!checked || busy} className="btn-primary h-11 w-full">{busy ? "Saving…" : "Accept and continue"}</button>
        <button type="button" onClick={onSignOut} disabled={busy} className="btn-ghost h-11 w-full">Sign out</button>
      </div>
    </Modal>
  );
}
