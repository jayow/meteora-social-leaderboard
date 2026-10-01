"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ApiSnapshot, ApiUser } from "@/lib/api-types";
import { loginMessage } from "@/lib/login-message";
import { getCachedProfile, patchCachedProfile, type CachedProfile } from "@/lib/storage";
import { onSessionChanged } from "@/lib/session-events";

interface MeState {
  wallet: string | null;
  user: ApiUser | null;
  snapshot: ApiSnapshot | null;
  cached: CachedProfile;
  verified: boolean;
  loading: boolean;
  ensureSession: () => Promise<boolean>;
  verify: () => Promise<boolean>;
  refresh: () => Promise<void>;
  update: (patch: { thesis?: string | null; country?: string | null; unlinkX?: boolean }) => Promise<{ ok: boolean; error?: string; needsAuth?: boolean }>;
}

const Ctx = createContext<MeState | null>(null);

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function MeProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, connected, signMessage } = useWallet();
  const wallet = connected && publicKey ? publicKey.toBase58() : null;
  const [user, setUser] = useState<ApiUser | null>(null);
  const [snapshot, setSnapshot] = useState<ApiSnapshot | null>(null);
  const [cached, setCached] = useState<CachedProfile>({});
  const [sessionUserId, setSessionUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const registered = useRef<string | null>(null);

  const loadSessionUserId = useCallback(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ userId?: number | null; wallet?: string | null }>)
      .then((d) => setSessionUserId(d.userId || null))
      .catch(() => setSessionUserId(null));
  }, []);

  useEffect(() => {
    setCached(getCachedProfile());
    loadSessionUserId();
  }, [loadSessionUserId]);

  const load = useCallback(async (w: string) => {
    const res = await fetch(`/api/users/${w}`, { cache: "no-store" });
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

  // Register on connect (idempotent upsert + stats sync), then load the DB profile.
  useEffect(() => {
    if (!wallet) {
      setUser(null);
      setSnapshot(null);
      return;
    }
    if (registered.current === wallet) return;
    registered.current = wallet;
    setLoading(true);
    setCached(patchCachedProfile({ wallet }));
    fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }) })
      .catch(() => null)
      .then(() => load(wallet))
      .finally(() => setLoading(false));
  }, [wallet, load]);

  // Joining / linking changes the profile (member number, X handle): refetch session and profile.
  useEffect(
    () =>
      onSessionChanged(() => {
        loadSessionUserId();
        if (wallet) void load(wallet).catch(() => null);
      }),
    [wallet, load, loadSessionUserId]
  );

  const ensureSession = useCallback(async (): Promise<boolean> => {
    if (sessionUserId) return true;
    if (!wallet || !signMessage) {
      return false;
    }
    try {
      const issuedAt = new Date().toISOString();
      const sig = await signMessage(new TextEncoder().encode(loginMessage(wallet, issuedAt)));
      const res = await fetch("/api/auth/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, issuedAt, signature: toBase64(sig) }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { user?: { id: number } };
      if (data.user?.id) {
        setSessionUserId(data.user.id);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [wallet, sessionUserId, signMessage]);

  const verify = useCallback(async (): Promise<boolean> => {
    if (!wallet || !signMessage) {
      alert("This wallet can't sign messages. Try Phantom or Solflare.");
      return false;
    }
    return ensureSession();
  }, [wallet, ensureSession, signMessage]);

  const refresh = useCallback(async () => {
    if (wallet) await load(wallet);
  }, [wallet, load]);

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
    () => ({ wallet, user, snapshot, cached, verified: Boolean(sessionUserId), loading, ensureSession, verify, refresh, update }),
    [wallet, user, snapshot, cached, sessionUserId, loading, ensureSession, verify, refresh, update]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMe(): MeState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMe must be used inside MeProvider");
  return v;
}
