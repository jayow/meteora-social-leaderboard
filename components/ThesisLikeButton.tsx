"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/components/MeProvider";
import { requestSignIn } from "@/lib/session-events";
import type { ThesisLikeResponse } from "@/lib/thesis-types";

/**
 * Like toggle with count for a thesis. Optimistic; reverts on failure. Signed out -> the app's sign-in
 * modal. Own theses show the count without a toggle. No replies anywhere, by design.
 */
export function ThesisLikeButton({
  thesisId,
  likeCount,
  liked,
  isOwn,
}: {
  thesisId: number;
  likeCount: number;
  liked: boolean;
  isOwn: boolean;
}) {
  const { userId, sessionChecked } = useMe();
  const [state, setState] = useState({ liked, count: likeCount });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Server data changed (refetch): adopt it.
  useEffect(() => setState({ liked, count: likeCount }), [liked, likeCount]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(t);
  }, [note]);

  const label = `${state.count} ${state.count === 1 ? "like" : "likes"}`;

  if (isOwn) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 px-2 text-base text-mute" title="Your thesis" data-testid="thesis-like-count">
        <HeartIcon filled={false} />
        <span className="num">{state.count}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  const toggle = async () => {
    if (busy) return;
    if (sessionChecked && !userId) {
      requestSignIn();
      return;
    }
    const prev = state;
    const next = { liked: !prev.liked, count: Math.max(0, prev.count + (prev.liked ? -1 : 1)) };
    setState(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/theses/${thesisId}/like`, { method: next.liked ? "POST" : "DELETE" });
      if (res.status === 401) {
        setState(prev);
        requestSignIn();
        return;
      }
      const data = (await res.json()) as ThesisLikeResponse | { error: string };
      if (!res.ok || "error" in data) {
        setState(prev);
        setNote("error" in data ? data.error : "Couldn't save that like");
        return;
      }
      setState({ liked: data.liked, count: data.likeCount });
    } catch {
      setState(prev);
      setNote("Couldn't save that like");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={state.liked}
        aria-label={state.liked ? `Unlike (${label})` : `Like (${label})`}
        className={`btn-ghost h-8 gap-1.5 px-2 font-medium ${state.liked ? "text-accent hover:text-accent" : ""}`}
        data-testid="thesis-like"
      >
        <HeartIcon filled={state.liked} />
        <span className="num">{state.count}</span>
      </button>
      {note && (
        <span role="status" className="text-sm text-mute">
          {note}
        </span>
      )}
    </span>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinejoin="round" d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
    </svg>
  );
}
