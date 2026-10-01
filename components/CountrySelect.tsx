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
    <label className={`relative flex h-10 items-center gap-2 rounded-full border border-border bg-surface pl-3 pr-8 text-[13px] font-semibold ${className}`}>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={flagUrl(value, 40)} alt="" className="h-[12px] w-[17px] shrink-0 rounded-[2px] object-cover" />
      ) : (
        <span aria-hidden className="shrink-0">🌍</span>
      )}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full bg-transparent opacity-0"
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
      <span className="pointer-events-none absolute right-3 text-[10px] text-mute">▼</span>
    </label>
  );
}
