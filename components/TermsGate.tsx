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
  return <div className="card mb-10 p-5" data-testid="terms-gate"><p className="text-lg font-semibold text-fg">Accept to continue to X sign in</p><p className="mt-1 text-base text-mute">Review this policy, then confirm your agreement before continuing.</p><div className="tile mt-4 p-3"><TermsCheckbox checked={checked} onChange={setChecked} id="terms-page-consent" /></div><a href={checked ? destination : undefined} aria-disabled={!checked} className={`btn-primary mt-4 h-11 w-full ${checked ? "" : "pointer-events-none opacity-45"}`}>Continue to X</a></div>;
}
