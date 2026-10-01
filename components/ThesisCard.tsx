"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui";
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
    <span className={`flex h-4 w-4 items-center justify-center rounded-full border border-surface bg-border-strong text-[9px] font-bold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

/** Tag for the pool a thesis was posted on; links to that pool's page in the app. */
export function ThesisPoolTag({ pool, token }: { pool: ThesisPool | null; token: ThesisPost["token"] }) {
  const cls =
    "inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-raised py-0.5 pl-1 pr-2 text-[12px] font-semibold text-fg transition hover:border-border-strong";
  if (pool) {
    const [x = "?", y = "?"] = pool.name.split("-");
    return (
      <Link href={`/pools/${pool.address}`} className={cls} title={`${pool.name}${pool.binStep ? ` · bin step ${pool.binStep}` : ""}`} data-testid="thesis-pool-tag">
        <span className="flex shrink-0">
          <TokenDot icon={pool.xIcon} label={x} />
          <TokenDot icon={pool.yIcon} label={y} className="-ml-1.5" />
        </span>
        <span className="truncate">{pool.name}</span>
        {pool.binStep != null && <span className="shrink-0 text-[11px] font-medium text-mute">· {pool.binStep}</span>}
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
    <Link href={href} className="truncate font-semibold text-fg hover:underline" data-testid="thesis-author">
      {primary}
    </Link>
  ) : (
    <span className="truncate font-semibold text-fg">{primary}</span>
  );
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {name}
      {secondary && <span className="truncate text-[13px] text-mute">{secondary}</span>}
    </span>
  );
}

export function ThesisBody({ body, size = "md" }: { body: string; size?: "md" | "sm" }) {
  const long = body.length > CLAMP_CHARS || body.split("\n").length > CLAMP_LINES;
  const [open, setOpen] = useState(false);
  const text = size === "md" ? "text-[15px] leading-[1.55]" : "text-[13.5px] leading-snug";
  return (
    <div>
      <p className={`whitespace-pre-wrap break-words text-fg-secondary ${text} ${long && !open ? "line-clamp-5" : ""}`} data-testid="thesis-body">
        {body}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1 text-[13px] font-semibold text-mute hover:text-fg" aria-expanded={open}>
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
    <span className={`num shrink-0 text-[12px] font-semibold ${pnlClass(pnl.usd)}`} title="Author's PnL in this pool (last sync)" data-testid="thesis-pool-pnl">
      {fmtUsd(pnl.usd, { signed: true })}
      {pnl.pct != null && (
        <span className="ml-1 opacity-60">
          {pnl.pct >= 0 ? "+" : "−"}
          {fmtPct(Math.abs(pnl.pct), 1)}
        </span>
      )}
    </span>
  );
}

/**
 * One thesis as a post: avatar, name/@handle, pool tag, time, full text (clamped), like.
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
        <div className="flex items-center gap-2 text-[14px]">
          <AuthorName author={post.author} />
          <span className="text-mute" aria-hidden>
            ·
          </span>
          <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()} className="shrink-0 text-[13px] text-mute">
            {timeAgo(post.createdAt)}
          </time>
          {onDelete && (
            <button type="button" onClick={onDelete} className="ml-auto shrink-0 text-[12px] font-semibold text-dn hover:underline">
              Delete
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ThesisPoolTag pool={post.pool} token={post.token} />
          <AuthorPoolPnl pnl={post.authorPoolPnl} />
          {post.pool && (
            <span className="text-[12px] text-mute" title="From the author's last sync">
              {post.authorInPool ? "In this pool" : "Exited this pool"}
            </span>
          )}
        </div>
        <div className="mt-2">
          <ThesisBody body={post.body} size={size} />
        </div>
        <div className="-ml-2 mt-1">
          <ThesisLikeButton thesisId={post.id} likeCount={post.likeCount} liked={post.likedByViewer} isOwn={post.isOwn} />
        </div>
      </div>
    </article>
  );
}

/** Thesis without the author header (the author is the page's subject, e.g. their profile). */
export function ThesisCompact({ post }: { post: ThesisPost }) {
  return (
    <article className="rounded-xl border border-border bg-bg p-3" data-testid="thesis-card" data-thesis-id={post.id}>
      <div className="flex items-center gap-2">
        <ThesisPoolTag pool={post.pool} token={post.token} />
        <AuthorPoolPnl pnl={post.authorPoolPnl} />
        <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()} className="ml-auto shrink-0 text-[11px] text-mute">
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
