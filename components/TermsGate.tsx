"use client";

import { useSearchParams } from "next/navigation";
import { TermsCheckbox } from "@/components/TermsCheckbox";
import { TERMS_VERSION } from "@/lib/legal";
import { useState } from "react";

export function TermsGate() {
  const params = useSearchParams();
  const [checked, setChecked] = useState(false);
  if (params.get("consent") !== "1") return null;
  const returnTo = params.get("returnTo") || "/profile/me";
  const destination = `/api/x/login?termsVersion=${encodeURIComponent(TERMS_VERSION)}&returnTo=${encodeURIComponent(returnTo)}`;
  return <div className="mb-10 rounded-3xl border border-border bg-surface-raised p-5" data-testid="terms-gate"><p className="text-lg font-bold text-fg">Accept to continue to X sign in</p><p className="mt-1 text-sm leading-6 text-mute">Review this policy, then confirm your agreement before continuing.</p><div className="mt-4"><TermsCheckbox checked={checked} onChange={setChecked} id="terms-page-consent" /></div><a href={checked ? destination : undefined} aria-disabled={!checked} className={`mt-4 w-full ${checked ? "btn-primary" : "btn-secondary pointer-events-none opacity-50"}`}>Continue to X</a></div>;
}
