"use client";

import Link from "next/link";

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}

export function TermsCheckbox({ checked, onChange, id = "terms-consent" }: TermsCheckboxProps) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-left text-base leading-5 text-mute">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />
      <span>
        I agree to the <Link href="/terms" target="_blank" className="link">Terms</Link> and{" "}
        <Link href="/privacy" target="_blank" className="link">Privacy Policy</Link>.
      </span>
    </label>
  );
}
