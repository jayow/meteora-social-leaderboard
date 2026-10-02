"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui";
import { onSessionChanged, requestSignIn } from "@/lib/session-events";
import { meteoraHomeUrl } from "@/lib/meteora-links";
import { THESIS_MAX_LENGTH, type ComposerResponse, type ThesisPost } from "@/lib/thesis-types";

/**
 * Poolside composer. Pools come from /api/poolside/composer (the pools you hold, the same list the
 * comments API accepts); posting goes through POST /api/tokens/[mint]/comments.
 */
export function Composer({ onPosted }: { onPosted: (post: ThesisPost) => void }) {
  const [info, setInfo] = useState<ComposerResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [poolAddress, setPoolAddress] = useState<string>("");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/poolside/composer", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ComposerResponse;
      setInfo(data);
      setLoadError(false);
      setPoolAddress((cur) => (data.pools.some((p) => p.address === cur) ? cur : data.pools[0]?.address ?? ""));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    return onSessionChanged(() => void load());
  }, [load]);

  const shell = (children: React.ReactNode) => (
    <div className="card p-4 sm:p-5" data-testid="poolside-composer">
      {children}
    </div>
  );

  if (!info && !loadError) {
    return shell(
      <div className="flex items-center gap-3" aria-hidden>
        <span className="skeleton h-10 w-10 shrink-0 rounded-full" />
        <span className="skeleton h-10 flex-1 rounded-tile" />
      </div>
    );
  }
  if (!info) {
    return shell(
      <p className="text-base text-mute">
        Couldn&apos;t check whether you can post.{" "}
        <button type="button" onClick={() => void load()} className="link">
          Try again
        </button>
      </p>
    );
  }

  if (!info.signedIn) {
    return shell(
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="composer-signed-out">
        <p className="text-base text-mute">Sign in to share a thesis on a pool you&apos;re in.</p>
        <button type="button" onClick={requestSignIn} className="btn-secondary">
          Sign in
        </button>
      </div>
    );
  }

  if (!info.joined) {
    return shell(
      <p className="text-base text-mute" data-testid="composer-note">
        Posting is for beta members. You&apos;re signed in but haven&apos;t joined yet;{" "}
        <Link href="/join" className="link">
          redeem an invite code
        </Link>{" "}
        to post.
      </p>
    );
  }

  if (info.pools.length === 0) {
    return shell(
      <p className="text-base text-mute" data-testid="composer-note">
        You can post a thesis on a pool once you hold a position in it. We don&apos;t see any open positions from your last
        sync.{" "}
        <a href={meteoraHomeUrl()} target="_blank" rel="noopener noreferrer" className="link">
          Meteora ↗
        </a>
      </p>
    );
  }

  const selected = info.pools.find((p) => p.address === poolAddress) ?? info.pools[0];
  const trimmed = text.trim();

  // Collapsed to one line until focused or holding text, so the feed starts higher.
  const expanded = focused || text.length > 0 || posting;

  const post = async () => {
    if (!trimmed || posting || !selected) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(selected.tokenMint)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed, poolAddress: selected.address }),
      });
      const data = (await res.json()) as { comment?: ThesisPost; error?: string };
      if (res.status === 401) {
        requestSignIn();
        return;
      }
      if (!res.ok || !data.comment) {
        setError(data.error || "Couldn't post that");
        if (res.status === 403) void load();
        return;
      }
      setText("");
      onPosted(data.comment);
    } catch {
      setError("Couldn't post that");
    } finally {
      setPosting(false);
    }
  };

  return shell(
    <div className="flex gap-3">
      {info.me && <Avatar user={{ id: info.me.id, xAvatarUrl: info.me.xAvatarUrl }} size={40} className="hidden sm:inline-block" />}
      <div
        className="min-w-0 flex-1"
        onFocus={() => setFocused(true)}
        onBlur={(ev) => {
          // Stay open while focus moves between the text, pool picker and Post.
          if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <label className="sr-only" htmlFor="poolside-text">
          Your thesis
        </label>
        <textarea
          id="poolside-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={THESIS_MAX_LENGTH}
          rows={expanded ? 3 : 1}
          placeholder={`What's your thesis on ${selected.name}?`}
          disabled={posting}
          className="field block h-auto resize-y py-2.5"
          data-testid="composer-text"
        />
        <div className={`mt-2 items-center gap-2 ${expanded ? "flex" : "hidden"}`}>
          <label className="sr-only" htmlFor="poolside-pool">
            Pool
          </label>
          <select
            id="poolside-pool"
            value={selected.address}
            onChange={(e) => setPoolAddress(e.target.value)}
            disabled={posting}
            title="Only pools you hold are listed. Your post is tagged with the pool."
            className="field h-9 min-w-0 flex-1 truncate px-3 font-medium sm:w-auto sm:max-w-[60%] sm:flex-none"
            data-testid="composer-pool"
          >
            {info.pools.map((p) => (
              <option key={p.address} value={p.address}>
                {p.name}
                {p.binStep != null ? ` · Bin ${p.binStep}` : ""}
                {p.positionCount > 1 ? ` · ${p.positionCount} positions` : ""}
              </option>
            ))}
          </select>
          <span className="num ml-auto shrink-0 text-sm text-mute">{text.length >= THESIS_MAX_LENGTH - 100 ? `${text.length}/${THESIS_MAX_LENGTH}` : ""}</span>
          <button
            type="button"
            onClick={() => void post()}
            disabled={!trimmed || posting}
            className="btn-primary shrink-0"
            data-testid="composer-post"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-base text-dn">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
