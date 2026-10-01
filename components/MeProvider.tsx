"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ApiSnapshot, ApiUser } from "@/lib/api-types";
import { getCachedProfile, patchCachedProfile, type CachedProfile } from "@/lib/storage";
import { onSessionChanged, requestSignIn } from "@/lib/session-events";

interface MeState {
  wallet: string | null;
  user: ApiUser | null;
  snapshot: ApiSnapshot | null;
  cached: CachedProfile;
  verified: boolean;
  /** Signed-in user id (wallet or X session), null when signed out or not checked yet. */
  userId: number | null;
  /** True once /api/auth/session has answered at least once. */
  sessionChecked: boolean;
  loading: boolean;
  ensureSession: () => Promise<boolean>;
  verify: () => Promise<boolean>;
  refresh: () => Promise<void>;
  update: (patch: { thesis?: string | null; country?: string | null; unlinkX?: boolean }) => Promise<{ ok: boolean; error?: string; needsAuth?: boolean }>;
}

const Ctx = createContext<MeState | null>(null);

export function MeProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, connected, signMessage } = useWallet();
  const wallet = connected && publicKey ? publicKey.toBase58() : null;
  const [user, setUser] = useState<ApiUser | null>(null);
  const [snapshot, setSnapshot] = useState<ApiSnapshot | null>(null);
  const [cached, setCached] = useState<CachedProfile>({});
  const [sessionUserId, setSessionUserId] = useState<number | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const registered = useRef<string | null>(null);

  const loadSessionUserId = useCallback(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ userId?: number | null; wallet?: string | null }>)
      .then((d) => setSessionUserId(d.userId || null))
      .catch(() => setSessionUserId(null))
      .finally(() => setSessionChecked(true));
  }, []);

  useEffect(() => {
    setCached(getCachedProfile());
    loadSessionUserId();
  }, [loadSessionUserId]);

  const load = useCallback(async (key: string) => {
    const res = await fetch(`/api/users/${encodeURIComponent(key)}`, { cache: "no-store" });
    if (res.status === 404) {
      setUser(null);
      setSnapshot(null);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { user: ApiUser | null; snapshot: ApiSnapshot | null };
    setUser(data.user);
    setSnapshot(data.snapshot);
    if (data.user) {
      setCached(
        patchCachedProfile({
          wallet: data.user.wallet,
          xHandle: data.user.xHandle,
          xName: data.user.xName,
          xAvatarUrl: data.user.xAvatarUrl,
          thesis: data.user.thesis,
          country: data.user.country,
        })
      );
    }
  }, []);

  // After sign-in, refresh the signed-in user's Meteora stats for the connected wallet (if it's
  // theirs). Never creates an account: a bare connect stays anonymous until a real sign-in
  // (signature / X) or join, so nothing happens while signed out.
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    if (!wallet || !sessionUserId) return;
    const key = `${wallet}:${sessionUserId}`;
    if (registered.current === key) return;
    registered.current = key;
    setLoading(true);
    setCached(patchCachedProfile({ wallet }));
    fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }) })
      .then((r) => (r.ok ? (r.json() as Promise<{ user: ApiUser | null; synced?: boolean | string }>) : null))
      .catch(() => null)
      .then((d) => {
        // Only refetch when there was an account to refresh.
        if (d?.synced === true) setReloadTick((t) => t + 1);
      })
      .finally(() => setLoading(false));
  }, [wallet, sessionUserId]);

  // "Me" is the signed-in user (wallet or X session) only. A connected-but-unsigned wallet is not an
  // account, and profiles are never looked up by wallet address.
  const profileKey = sessionUserId ? String(sessionUserId) : null;
  useEffect(() => {
    if (!profileKey) {
      setUser(null);
      setSnapshot(null);
      return;
    }
    void load(profileKey).catch(() => null);
  }, [profileKey, load, reloadTick]);

  // Joining / linking changes the profile (member number, X handle): refetch session and profile.
  useEffect(
    () =>
      onSessionChanged(() => {
        loadSessionUserId();
        setReloadTick((t) => t + 1);
      }),
    [loadSessionUserId]
  );

  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (sessionUserId) return true;
    // Sign-in always goes through the consent checkbox in SignInModal; do not silently sign.
    requestSignIn();
    return false;
  }, [sessionUserId]);

  const verify = useCallback(async (): Promise<boolean> => {
    if (!wallet || !signMessage) {
      alert("This wallet can't sign messages. Try Phantom or Solflare.");
      return false;
    }
    return ensureSession();
  }, [wallet, ensureSession, signMessage]);

  const refresh = useCallback(async () => {
    if (profileKey) await load(profileKey);
  }, [profileKey, load]);

  const update = useCallback(
    async (patch: { thesis?: string | null; country?: string | null; unlinkX?: boolean }) => {
      if (!sessionUserId) return { ok: false, error: "Sign in required", needsAuth: true };
      const local: Partial<CachedProfile> = {};
      if (patch.thesis !== undefined) local.thesis = patch.thesis;
      if (patch.country !== undefined) local.country = patch.country;
      if (patch.unlinkX) Object.assign(local, { xHandle: null, xName: null, xAvatarUrl: null });
      setCached(patchCachedProfile(local));
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 401) setSessionUserId(null);
        return { ok: false, error: d.error || "Save failed" };
      }
      const d = (await res.json()) as { user: ApiUser };
      setUser(d.user);
      return { ok: true };
    },
    [sessionUserId]
  );

  const value = useMemo<MeState>(
    () => ({ wallet, user, snapshot, cached, verified: Boolean(sessionUserId), userId: sessionUserId, sessionChecked, loading, ensureSession, verify, refresh, update }),
    [wallet, user, snapshot, cached, sessionUserId, sessionChecked, loading, ensureSession, verify, refresh, update]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe(): MeState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMe must be used inside MeProvider");
  return v;
}
