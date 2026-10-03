"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { onSessionChanged, requestSignIn } from "@/lib/session-events";
import { meteoraHomeUrl } from "@/lib/meteora-links";
import { THESIS_MAX_LENGTH, type ComposerPool, type ComposerResponse, type ThesisPost } from "@/lib/thesis-types";

/** One token icon (or its first letter) for the pool pill. */
function Dot({ icon, label, className = "" }: { icon: string | null; label: string; className?: string }) {
  return icon ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon} alt="" className={`h-5 w-5 shrink-0 rounded-full border border-bg bg-surface-raised object-cover ${className}`} />
  ) : (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-bg bg-surface-raised text-xs font-semibold text-mute ${className}`} aria-hidden="true">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Pool name with its icons, bin step and how many positions you hold in it. */
function PoolLabel({ pool }: { pool: ComposerPool }) {
  const [x = "?", y = "?"] = pool.name.split("-");
  const meta = [pool.binStep != null ? `Bin ${pool.binStep}` : null, pool.positionCount > 1 ? `${pool.positionCount} positions` : null].filter(Boolean).join(" · ");
  return (
    <>
      <span className="flex shrink-0" aria-hidden="true">
        <Dot icon={pool.xIcon} label={x} />
        <Dot icon={pool.yIcon} label={y} className="-ml-1.5" />
      </span>
      {/* The name always shows in full; the bin / positions detail is what gives way on narrow screens. */}
      <span className="shrink-0 font-medium text-fg">{pool.name}</span>
      {meta && <span className="num min-w-0 truncate text-sm text-mute">{meta}</span>}
    </>
  );
}

/**
 * The pool your post is tagged with: a pill like the one on posts. With one pool it's just the pill;
 * with several it opens a small menu (arrow keys move, Escape or a click outside closes).
 */
function PoolPicker({ pools, value, onChange, disabled }: { pools: ComposerPool[]; value: ComposerPool; onChange: (address: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pill = "inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-surface-raised pl-1.5 pr-3 text-base";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    // Focus the selected option so arrow keys start from it.
    wrap.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (pools.length <= 1) {
    return (
      <span className={`${pill} sm:max-w-[70%]`} title="Your post is tagged with this pool" data-testid="composer-pool">
        <PoolLabel pool={value} />
      </span>
    );
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div ref={wrap} className="relative min-w-0 sm:max-w-[70%]" onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Only pools you hold are listed. Your post is tagged with the pool."
        className={`${pill} transition hover:border-border-strong disabled:opacity-60`}
        data-testid="composer-pool"
      >
        <PoolLabel pool={value} />
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 shrink-0 text-mute transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Pool"
          className="absolute left-0 top-full z-30 mt-2 max-h-72 w-max min-w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-tile border border-border-strong bg-surface p-1 shadow-lg shadow-black/40"
          data-testid="composer-pool-menu"
        >
          {pools.map((p) => {
            const on = p.address === value.address;
            return (
              <button
                key={p.address}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(p.address);
                  setOpen(false);
                  button.current?.focus();
                }}
                className={`flex w-full min-w-0 items-center gap-2 rounded-tag px-2 py-2 text-left text-base outline-none transition hover:bg-surface-raised focus-visible:bg-surface-raised ${on ? "bg-surface-raised" : ""}`}
              >
                <PoolLabel pool={p} />
                <svg viewBox="0 0 16 16" className={`ml-auto h-4 w-4 shrink-0 pl-1 ${on ? "text-fg" : "invisible"}`} fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
    <div data-testid="poolside-composer">
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
        <p className="text-base text-mute">Sign in to share an LP idea on a pool you&apos;re in.</p>
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
        You can post an LP idea on a pool once you hold a position in it. We don&apos;t see any open positions from your last
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
          Your LP idea
        </label>
        <textarea
          id="poolside-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={THESIS_MAX_LENGTH}
          rows={expanded ? 3 : 1}
          placeholder={`What's your LP idea for ${selected.name}?`}
          disabled={posting}
          className="field block h-auto resize-y py-2.5"
          data-testid="composer-text"
        />
        <div className={`mt-2 items-center gap-2 ${expanded ? "flex" : "hidden"}`}>
          <PoolPicker pools={info.pools} value={selected} onChange={setPoolAddress} disabled={posting} />
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
