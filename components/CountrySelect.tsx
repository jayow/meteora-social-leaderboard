"use client";

import { useMemo } from "react";
import { countryOptions, flagUrl } from "@/lib/countries";

export function CountrySelect({ value, onChange, allLabel = "All countries", disabled = false }: { value: string; onChange: (v: string) => void; allLabel?: string; disabled?: boolean }) {
  const options = useMemo(() => countryOptions(), []);
  return (
    <label className="glass relative flex h-10 shrink-0 items-center gap-2 rounded-full pl-3 pr-8 text-[13px] font-semibold">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={flagUrl(value, 40)} alt="" className="h-[12px] w-[17px] rounded-[2px] object-cover" />
      ) : (
        <span aria-hidden>🌍</span>
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
      <span className="pointer-events-none">{value ? options.find((o) => o.code === value)?.name : allLabel}</span>
      <span className="pointer-events-none absolute right-3 text-[10px] text-mute">▼</span>
    </label>
  );
}
