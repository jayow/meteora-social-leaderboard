"use client";

/**
 * localStorage cache of *your own* profile. The database is the source of truth;
 * this cache keeps the UI instant and works as a fallback if the API is unavailable.
 */
export interface CachedProfile {
  wallet?: string;
  xHandle?: string | null;
  xName?: string | null;
  xAvatarUrl?: string | null;
  thesis?: string | null;
  country?: string | null;
  updatedAt?: string;
}

const K_PROFILE = "pp_profile_v2";
const LEGACY_KEYS = ["meteora_user", "meteora_traders"];

export function getCachedProfile(): CachedProfile {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(K_PROFILE);
    if (raw) return JSON.parse(raw) as CachedProfile;
    // Migrate v1 (xHandle/xAvatarUrl/thesis/walletAddress) if present.
    const legacy = localStorage.getItem("meteora_user");
    if (legacy) {
      const u = JSON.parse(legacy) as { walletAddress?: string; xHandle?: string; xAvatarUrl?: string; thesis?: string };
      const thesis = u.thesis && u.thesis !== "Write your LP idea here..." ? u.thesis : null;
      const migrated: CachedProfile = { wallet: u.walletAddress, xHandle: u.xHandle ?? null, xAvatarUrl: u.xAvatarUrl ?? null, thesis };
      saveCachedProfile(migrated);
      return migrated;
    }
  } catch {
    // ignore corrupt cache
  }
  return {};
}

export function saveCachedProfile(p: CachedProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(K_PROFILE, JSON.stringify({ ...p, updatedAt: new Date().toISOString() }));
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    // storage full / disabled
  }
}

export function patchCachedProfile(patch: Partial<CachedProfile>): CachedProfile {
  const next = { ...getCachedProfile(), ...patch };
  saveCachedProfile(next);
  return next;
}

export function clearCachedProfile(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(K_PROFILE);
}
