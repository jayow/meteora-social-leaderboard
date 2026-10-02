"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onSessionChanged } from "@/lib/session-events";
import type { PositionSharingState } from "@/lib/activity-types";

const ENDPOINT = "/api/users/me/position-sharing";
/** Fired with the new state after a save, so the profile toggle and the prompt card stay in sync. */
const CHANGED_EVENT = "pp:position-sharing-changed";

type Patch = { share?: boolean; dismiss?: true };

/** The viewer's own position-sharing setting (null while loading, signed out, or on error). */
function usePositionSharing() {
  const [state, setState] = useState<PositionSharingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: "no-store" });
      setState(res.ok ? ((await res.json()) as PositionSharingState) : null);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const offSession = onSessionChanged(() => void load());
    const onChanged = (e: Event) => setState((e as CustomEvent<PositionSharingState>).detail);
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => {
      offSession();
      window.removeEventListener(CHANGED_EVENT, onChanged);
    };
  }, [load]);

  const save = async (patch: Patch): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = (await res.json().catch(() => null)) as PositionSharingState | { error?: string } | null;
      if (!res.ok || !data || !("joined" in data)) {
        setError((data && "error" in data && data.error) || "Couldn't save");
        return false;
      }
      window.dispatchEvent(new CustomEvent<PositionSharingState>(CHANGED_EVENT, { detail: data }));
      return true;
    } catch {
      setError("Couldn't save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { state, saving, error, save };
}

/** Owner setting on their own profile. Members only (nothing is recorded before joining). */
export function PositionSharingToggle() {
  const { state, saving, error, save } = usePositionSharing();
  if (!state?.joined) return null;
  const on = state.share;
  return (
    <div className="tile px-4 py-3" data-testid="position-sharing-setting">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="position-sharing-label" className="text-base font-semibold text-fg">
            Share my opened/closed positions on Poolside
          </p>
          <p id="position-sharing-desc" className="mt-0.5 text-sm leading-snug text-mute">
            {on
              ? "Pools you open or close, with realized PnL on closes, show up from the moment you turned this on."
              : "Off: only your theses, follows and badges appear. Turning it on shares new activity only, never past positions."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="position-sharing-label"
          aria-describedby="position-sharing-desc"
          disabled={saving}
          onClick={() => void save({ share: !on })}
          className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition disabled:opacity-45 ${
            on ? "border-accent bg-accent" : "border-border-strong bg-surface-raised"
          }`}
          data-testid="position-sharing-switch"
        >
          <span className={`block h-4 w-4 rounded-full transition-transform ${on ? "translate-x-[19px] bg-accent-fg" : "translate-x-[3px] bg-mute"}`} aria-hidden />
        </button>
      </div>
      {error && <p className="w-full text-sm text-dn">{error}</p>}
    </div>
  );
}

/**
 * One-time post-join prompt (Poolside). Shown to members who haven't answered yet;
 * "Not now" counts as an answer, so it never comes back. Sharing stays off unless they say yes.
 */
export function PositionSharingPrompt({ className = "" }: { className?: string }) {
  const { state, saving, error, save } = usePositionSharing();
  const [justEnabled, setJustEnabled] = useState(false);

  if (justEnabled) {
    return (
      <div className={`card px-5 py-4 text-base text-fg-secondary ${className}`} role="status" data-testid="position-sharing-prompt-done">
        Sharing is on. New opens and closes will show on Poolside. Turn it off anytime in{" "}
        <Link href="/profile/me" className="link">
          Edit profile
        </Link>
        .
      </div>
    );
  }
  if (!state?.joined || state.asked) return null;

  return (
    <div className={`tile flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 ${className}`} data-testid="position-sharing-prompt">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-base font-semibold text-fg">Share your opens and closes on Poolside?</p>
        <p className="mt-0.5 text-sm text-mute">New activity only, with realized PnL on closes. Never past positions. Change it anytime.</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            if (await save({ share: true })) setJustEnabled(true);
          }}
          className="btn-secondary h-8 px-3"
          data-testid="position-sharing-yes"
        >
          Share
        </button>
        <button type="button" disabled={saving} onClick={() => void save({ dismiss: true })} className="btn-ghost h-8 px-3" data-testid="position-sharing-no">
          Not now
        </button>
      </div>
      {error && <p className="w-full text-sm text-dn">{error}</p>}
    </div>
  );
}
