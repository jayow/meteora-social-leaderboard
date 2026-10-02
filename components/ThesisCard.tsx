"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, binLabel } from "@/components/ui";
import { ThesisLikeButton } from "@/components/ThesisLikeButton";
import { fmtPct, fmtUsd, pnlClass, timeAgo } from "@/lib/format";
import type { ThesisAuthor, ThesisPool, ThesisPost } from "@/lib/thesis-types";

/** Longer than this (or more than 5 lines) starts clamped with "Show more". */
const CLAMP_CHARS = 280;
const CLAMP_LINES = 5;

export function thesisAuthorHref(a: ThesisAuthor): string | null {
  return a.hasProfile ? `/profile/${a.xHandle || a.id}` : null;
}

function TokenDot({ icon, label, className = "" }: { icon: string | null; label: string; className?: string }) {
  if (icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" className={`h-4 w-4 rounded-full border border-surface bg-surface-raised object-cover ${className}`} loading="lazy" />;
  }
  return (
    <span className={`flex h-4 w-4 items-center justify-center rounded-full border border-surface bg-border-strong text-xs font-semibold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

/** Tag for the pool a thesis was posted on; links to that pool's page in the app. */
export function ThesisPoolTag({ pool, token }: { pool: ThesisPool | null; token: ThesisPost["token"] }) {
  const cls =
    "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-raised pl-1 pr-2 text-sm font-semibold text-fg transition hover:border-border-strong";
  if (pool) {
    const [x = "?", y = "?"] = pool.name.split("-");
    return (
      <Link href={`/pools/${pool.address}`} className={cls} title={`${pool.name}${pool.binStep ? ` · ${binLabel(pool.binStep)}` : ""}`} data-testid="thesis-pool-tag">
        <span className="flex shrink-0">
          <TokenDot icon={pool.xIcon} label={x} />
          <TokenDot icon={pool.yIcon} label={y} className="-ml-1.5" />
        </span>
        <span className="truncate">{pool.name}</span>
        {pool.binStep != null && <span className="hidden shrink-0 font-medium text-mute sm:inline">{binLabel(pool.binStep)}</span>}
      </Link>
    );
  }
  return (
    <Link href={`/pools?token=${encodeURIComponent(token.mint)}`} className={cls} data-testid="thesis-pool-tag">
      <TokenDot icon={token.icon} label={token.symbol ?? "?"} />
      <span className="truncate">{token.symbol ? `$${token.symbol}` : "Token"}</span>
    </Link>
  );
}

function AuthorName({ author }: { author: ThesisAuthor }) {
  const href = thesisAuthorHref(author);
  const primary = author.xHandle ? author.xName || `@${author.xHandle}` : author.anonName || "Pool Partier";
  const secondary = author.xHandle && author.xName ? `@${author.xHandle}` : null;
  const name = href ? (
    <Link href={href} className="truncate font-semibold text-fg transition hover:text-fg-secondary" data-testid="thesis-author">
      {primary}
    </Link>
  ) : (
    <span className="truncate font-semibold text-fg">{primary}</span>
  );
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {name}
      {secondary && <span className="hidden truncate text-mute sm:inline">{secondary}</span>}
    </span>
  );
}

export function ThesisBody({ body, size = "md" }: { body: string; size?: "md" | "sm" }) {
  const long = body.length > CLAMP_CHARS || body.split("\n").length > CLAMP_LINES;
  const [open, setOpen] = useState(false);
  const text = size === "md" ? "text-md" : "text-base";
  return (
    <div>
      <p className={`whitespace-pre-wrap break-words text-fg-secondary ${text} ${long && !open ? "line-clamp-5" : ""}`} data-testid="thesis-body">
        {body}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-base font-semibold text-mute transition hover:text-fg" aria-expanded={open}>
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/** PnL of the author's open position in the thesis's pool, from their last sync. */
function AuthorPoolPnl({ pnl }: { pnl: ThesisPost["authorPoolPnl"] }) {
  if (!pnl) return null;
  return (
    <span className={`num shrink-0 text-sm font-semibold ${pnlClass(pnl.usd)}`} title="Author's PnL in this pool (last sync)" data-testid="thesis-pool-pnl">
      {fmtUsd(pnl.usd, { signed: true })}
      {pnl.pct != null && (
        <span className="ml-1 font-medium">
          {pnl.pct >= 0 ? "+" : "−"}
          {fmtPct(Math.abs(pnl.pct), 1)}
        </span>
      )}
    </span>
  );
}

/**
 * One thesis as a post: avatar, name/@handle and time, the text (clamped), then pool tag, PnL and like.
 * Used on Poolside, the pool page and profiles so they all look and count the same.
 */
export function ThesisCard({ post, onDelete, size = "md" }: { post: ThesisPost; onDelete?: () => void; size?: "md" | "sm" }) {
  const href = thesisAuthorHref(post.author);
  const avatarSize = size === "md" ? 40 : 32;
  const avatar = <Avatar user={{ id: post.author.id, xAvatarUrl: post.author.xAvatarUrl }} size={avatarSize} />;
  return (
    <article className="flex gap-3" data-testid="thesis-card" data-thesis-id={post.id}>
      {href ? (
        <Link href={href} className="shrink-0" tabIndex={-1} aria-hidden>
          {avatar}
        </Link>
      ) : (
        <span className="shrink-0">{avatar}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5 text-base">
          <AuthorName author={post.author} />
          <span className="shrink-0 text-mute" aria-hidden>
            ·
          </span>
          <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()} className="shrink-0 text-mute">
            {timeAgo(post.createdAt)}
          </time>
        </div>
        <div className="mt-1">
          <ThesisBody body={post.body} size={size} />
        </div>
        {/* Context after the text: pool and the author's PnL in it on the left, actions on the right. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <ThesisPoolTag pool={post.pool} token={post.token} />
          <AuthorPoolPnl pnl={post.authorPoolPnl} />
          {/* "In this pool" is the default (the PnL beside it says so); only an exit is worth a word. */}
          {post.pool && !post.authorInPool && (
            <span className="text-sm text-mute" title="From the author's last sync">
              Exited this pool
            </span>
          )}
          <span className="-mr-2 ml-auto flex items-center">
            <ThesisLikeButton thesisId={post.id} likeCount={post.likeCount} liked={post.likedByViewer} isOwn={post.isOwn} />
            {onDelete && (
              <button type="button" onClick={onDelete} className="btn-ghost h-8 shrink-0 px-3 text-dn hover:text-dn">
                Delete
              </button>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}

/** Thesis without the author header (the author is the page's subject, e.g. their profile). */
export function ThesisCompact({ post }: { post: ThesisPost }) {
  return (
    <article className="tile p-3" data-testid="thesis-card" data-thesis-id={post.id}>
      <div className="flex min-w-0 items-center gap-2">
        <ThesisPoolTag pool={post.pool} token={post.token} />
        <AuthorPoolPnl pnl={post.authorPoolPnl} />
        <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()} className="ml-auto shrink-0 text-sm text-mute">
          {timeAgo(post.createdAt)}
        </time>
      </div>
      <div className="mt-2">
        <ThesisBody body={post.body} size="sm" />
      </div>
      <div className="-mb-1 -ml-2 mt-0.5">
        <ThesisLikeButton thesisId={post.id} likeCount={post.likeCount} liked={post.likedByViewer} isOwn={post.isOwn} />
      </div>
    </article>
  );
}
