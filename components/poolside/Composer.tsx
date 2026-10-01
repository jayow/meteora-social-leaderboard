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
    <div className="rounded-2xl border border-border bg-surface p-4" data-testid="poolside-composer">
      {children}
    </div>
  );

  if (!info && !loadError) {
    return shell(
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-raised" />
        <span className="h-9 flex-1 animate-pulse rounded-xl bg-surface-raised" />
      </div>
    );
  }
  if (!info) {
    return shell(
      <p className="text-[13px] text-mute">
        Couldn&apos;t check whether you can post.{" "}
        <button type="button" onClick={() => void load()} className="font-semibold text-fg hover:underline">
          Try again
        </button>
      </p>
    );
  }

  if (!info.signedIn) {
    return shell(
      <div className="flex flex-wrap items-center justify-between gap-3" data-testid="composer-signed-out">
        <p className="text-[13.5px] text-mute">Sign in to share a thesis on a pool you&apos;re in.</p>
        <button type="button" onClick={requestSignIn} className="btn-secondary h-9 px-4 text-[13px]">
          Sign in
        </button>
      </div>
    );
  }

  if (!info.joined) {
    return shell(
      <p className="text-[13.5px] text-mute" data-testid="composer-note">
        Posting is for beta members. You&apos;re signed in but haven&apos;t joined yet;{" "}
        <Link href="/join" className="font-semibold text-fg hover:underline">
          redeem an invite code
        </Link>{" "}
        to post.
      </p>
    );
  }

  if (info.pools.length === 0) {
    return shell(
      <p className="text-[13.5px] text-mute" data-testid="composer-note">
        You can post a thesis on a pool once you hold a position in it. We don&apos;t see any open positions from your last
        sync.{" "}
        <a href={meteoraHomeUrl()} target="_blank" rel="noopener noreferrer" className="font-semibold text-fg hover:underline">
          Meteora ↗
        </a>
      </p>
    );
  }

  const selected = info.pools.find((p) => p.address === poolAddress) ?? info.pools[0];
  const trimmed = text.trim();

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
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="poolside-text">
          Your thesis
        </label>
        <textarea
          id="poolside-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={THESIS_MAX_LENGTH}
          rows={3}
          placeholder={`What's your thesis on ${selected.name}?`}
          disabled={posting}
          className="block w-full resize-y rounded-xl border border-border bg-surface-raised p-3 text-[14px] leading-snug text-fg outline-none placeholder:text-mute focus:border-border-strong disabled:opacity-60"
          data-testid="composer-text"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="poolside-pool">
            Pool
          </label>
          <select
            id="poolside-pool"
            value={selected.address}
            onChange={(e) => setPoolAddress(e.target.value)}
            disabled={posting}
            className="h-8 max-w-[60%] truncate rounded-full border border-border bg-surface-raised px-3 text-[12.5px] font-semibold text-fg outline-none focus:border-border-strong"
            data-testid="composer-pool"
          >
            {info.pools.map((p) => (
              <option key={p.address} value={p.address}>
                {p.name}
                {p.binStep != null ? ` · bin ${p.binStep}` : ""}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[12px] text-mute num">
            {text.length}/{THESIS_MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={() => void post()}
            disabled={!trimmed || posting}
            className="btn-primary h-9 px-5 text-[13px]"
            data-testid="composer-post"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
        <p className="mt-1.5 text-[12px] text-mute">Only pools you hold are listed. Your post is tagged with the pool.</p>
        {error && (
          <p role="alert" className="mt-1.5 text-[12.5px] text-dn">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
