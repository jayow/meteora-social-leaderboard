"use client";

import { useState } from "react";
import Image from "next/image";
import type { PoolInfo } from "@/lib/api-types";
import { flagUrl, countryName } from "@/lib/countries";
import { avatarFor, fallbackAvatar } from "@/lib/format";

export function Avatar({ user, size = 40, ring = false, className = "" }: { user: { xAvatarUrl?: string | null; id?: number }; size?: number; ring?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed ? fallbackAvatar(user.id || 'anon') : avatarFor(user)}
      onError={() => setFailed(true)}
      alt=""
      width={size}
      height={size}
      className="rounded-full bg-surface-raised object-cover"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
  if (!ring) return <span className={`inline-block shrink-0 ${className}`}>{img}</span>;
  return (
    <span className={`inline-block shrink-0 rounded-full bg-border-strong p-[2px] ${className}`}>
      <span className="block rounded-full bg-bg p-[2px]">{img}</span>
    </span>
  );
}

export function Flag({ code, className = "" }: { code?: string | null; className?: string }) {
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={flagUrl(code, 40)} alt={countryName(code)} title={countryName(code)} className={`inline-block h-[12px] w-[17px] rounded-[2px] object-cover ${className}`} loading="lazy" />
  );
}

function TokenDot({ icon, label, className = "" }: { icon: string | null; label: string; className?: string }) {
  if (icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt={label} className={`h-4 w-4 rounded-full border border-surface bg-surface-raised object-cover ${className}`} loading="lazy" />;
  }
  return (
    <span className={`flex h-4 w-4 items-center justify-center rounded-full border border-surface bg-border-strong text-[9px] font-bold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

export function PoolChip({ pool, compact = false }: { pool: PoolInfo | null; compact?: boolean }) {
  if (!pool) return <span className="text-[12px] text-mute">No pool yet</span>;
  const [x = "?", y = "?"] = pool.name.split("-");
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-raised py-0.5 pl-1 pr-2 text-[12px] font-semibold" title={`${pool.name}${pool.binStep ? ` · bin step ${pool.binStep}` : ""}`}>
      <span className="flex">
        <TokenDot icon={pool.xIcon} label={x} />
        <TokenDot icon={pool.yIcon} label={y} className="-ml-1.5" />
      </span>
      <span className="truncate">{pool.name}</span>
      {!compact && (
        <>
          <span className="rounded border border-border px-1 text-[10px] font-semibold uppercase text-mute">{pool.protocol === "damm_v2" ? "DAMM" : "DLMM"}</span>
          {pool.binStep != null && <span className="text-[10px] font-medium text-mute">Bin {pool.binStep}</span>}
        </>
      )}
    </span>
  );
}

export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="glass flex items-center gap-1 rounded-full p-1">
      {label && <span className="pl-3 pr-1 text-[13px] font-medium text-mute">{label}</span>}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-full px-3.5 text-[13px] font-semibold transition ${
            value === o.value ? "bg-accent text-accent-fg" : "text-mute hover:bg-surface-raised hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatTile({ label, value, tone = "white", sub }: { label: string; value: string; tone?: "white" | "up" | "dn"; sub?: string }) {
  const c = { white: "text-fg", up: "text-up", dn: "text-dn" }[tone];
  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-3">
      <div className="text-[11px] font-medium text-mute">{label}</div>
      <div className={`num mt-0.5 text-[20px] font-bold leading-tight ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-mute">{sub}</div>}
    </div>
  );
}

export function XIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function Logo() {
  return (
    <>
      <Image src="/logo.svg" alt="Pool Party" width={151} height={32} priority unoptimized className="hidden h-7 w-auto max-[379px]:block sm:hidden sm:h-8 md:block" />
      <Image src="/logo-mark.svg" alt="Pool Party" width={32} height={28} priority unoptimized className="h-7 w-auto max-[379px]:hidden sm:block md:hidden" />
    </>
  );
}
