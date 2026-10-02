"use client";

import { useEffect, useMemo, useState } from "react";
import { countryOptions, flagUrl } from "@/lib/countries";

interface CountryOption {
  code: string;
  name: string;
}

export function CountrySelect({ value, onChange, allLabel = "All countries", disabled = false, membersOnly = false, className = "shrink-0" }: { value: string; onChange: (v: string) => void; allLabel?: string; disabled?: boolean; membersOnly?: boolean; className?: string }) {
  const [apiOptions, setApiOptions] = useState<CountryOption[] | null>(null);
  const allOptions = useMemo(() => countryOptions(), []);
  
  useEffect(() => {
    if (!membersOnly) return;
    fetch("/api/countries")
      .then((r) => r.json() as Promise<{ countries: { code: string; name: string }[] }>)
      .then((d) => setApiOptions(d.countries))
      .catch(() => setApiOptions([]));
  }, [membersOnly]);

  const options = membersOnly ? (apiOptions ?? []) : allOptions;

  return (
    <label className={`relative flex h-9 items-center gap-2 rounded-full border border-border bg-surface pl-3 pr-8 text-base font-semibold transition has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-accent has-[select:focus-visible]:outline-solid hover:border-border-strong ${disabled ? "opacity-60" : ""} ${className}`}>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={flagUrl(value, 40)} alt="" className="h-[12px] w-[17px] shrink-0 rounded-[2px] object-cover" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-mute" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      )}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full bg-transparent opacity-0 disabled:cursor-not-allowed"
        aria-label="Country"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none min-w-0 truncate">{value ? options.find((o) => o.code === value)?.name : allLabel}</span>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-mute" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
