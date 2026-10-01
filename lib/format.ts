export function fmtUsd(n: number | null | undefined, opts: { signed?: boolean; compact?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const { signed = false, compact = true } = opts;
  const sign = n > 0 ? (signed ? "+" : "") : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  let body: string;
  if (compact && abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(2)}M`;
  else if (compact && abs >= 10_000) body = `${(abs / 1000).toFixed(1)}K`;
  else if (compact && abs >= 1000) body = `${(abs / 1000).toFixed(2)}K`;
  else if (!compact) body = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  else body = abs.toFixed(abs >= 100 ? 0 : 2);
  return `${sign}$${body}`;
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function pnlClass(n: number | null | undefined): string {
  if (n == null || n === 0) return "text-white";
  return n > 0 ? "text-up" : "text-dn";
}

export function shortAddr(w: string): string {
  return `${w.slice(0, 4)}…${w.slice(-4)}`;
}

export function fallbackAvatar(seed: string | number): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=ffd5c2,d9ccff,ffc9dc`;
}

export function avatarFor(u: { xAvatarUrl?: string | null; id?: number }): string {
  if (u.xAvatarUrl) {
    return u.xAvatarUrl.replace('_normal', '_400x400');
  }
  
  return fallbackAvatar(u.id || 'anon');
}

/** Fallback when a row has neither an X handle nor a generated name (should be rare). */
export const DEFAULT_DISPLAY_NAME = "Pool Partier";

/** Public label for a user: X handle when linked, else their generated beach name ("Salty Flamingo"). */
export function displayName(u: { xHandle?: string | null; anonName?: string | null }): string {
  if (u.xHandle) return `@${u.xHandle}`;
  if (u.anonName) return u.anonName;
  return DEFAULT_DISPLAY_NAME;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "1 position" / "4 positions" (open LP positions; several can sit in one pool). */
export function fmtPositions(n: number): string {
  return `${n} position${n === 1 ? "" : "s"}`;
}
