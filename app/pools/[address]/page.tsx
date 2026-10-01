"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMe } from "@/components/MeProvider";
import { Avatar, Flag } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";
import { avatarFor, displayName, fmtUsd, timeAgo } from "@/lib/format";
import { meteoraPoolUrl, meteoraHomeUrl } from "@/lib/meteora-links";
import { applyFollowChange, onFollowChanged } from "@/lib/session-events";

interface PoolData {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenYMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  protocol: string | null;
  lpCount: number;
}

interface LP {
  id: number;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  xVerified: boolean;
  anonName: string | null;
  country: string | null;
  valueUsd: number | null;
  totalPnl: number | null;
  isFollowing: boolean;
}

interface PoolDetailResponse {
  pool: PoolData | null;
  lps: LP[];
}

interface CommentAuthor {
  id: number;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
  anonName?: string | null;
  /** True when the author has a public (joined) profile to link to. */
  hasProfile?: boolean;
}

interface Comment {
  id: number;
  tokenMint: string;
  userId: number;
  body: string;
  createdAt: string;
  author: CommentAuthor;
}

interface CommentsResponse {
  comments: Comment[];
}

function TokenDot({ icon, label, className = "" }: { icon: string | null; label: string; className?: string }) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={label}
        className={`h-12 w-12 rounded-full border-2 border-surface bg-surface-raised object-cover ${className}`}
        loading="lazy"
      />
    );
  }
  return (
    <span className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-surface bg-border-strong text-[16px] font-bold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

export default function PoolDetailPage() {
  const params = useParams();
  const address = params?.address as string | undefined;
  const { user } = useMe();
  const [data, setData] = useState<PoolDetailResponse | null>(null);

  // Keep LP rows' follow state in sync with Follow clicks anywhere on the page.
  useEffect(
    () => onFollowChanged((change) => setData((d) => (d ? { ...d, lps: d.lps.map((lp) => applyFollowChange(lp, change)) } : d))),
    []
  );
  const [comments, setComments] = useState<CommentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pools/${address}`, { cache: "no-store" });
      const poolData = (await res.json()) as PoolDetailResponse;
      setData(poolData);
      
      if (poolData.pool?.tokenXMint) {
        const commentsRes = await fetch(`/api/tokens/${encodeURIComponent(poolData.pool.tokenXMint)}/comments`, {
          cache: "no-store",
        });
        setComments((await commentsRes.json()) as CommentsResponse);
      }
    } catch {
      setData({ pool: null, lps: [] });
      setComments({ comments: [] });
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const loadComments = useCallback(async () => {
    if (!data?.pool?.tokenXMint) return;
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(data.pool.tokenXMint)}/comments`, {
        cache: "no-store",
      });
      setComments((await res.json()) as CommentsResponse);
    } catch {
      setComments({ comments: [] });
    }
  }, [data?.pool?.tokenXMint]);

  const postComment = async () => {
    if (!commentText.trim() || !data?.pool?.tokenXMint) return;

    setPosting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(data.pool.tokenXMint)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText }),
      });

      if (!res.ok) {
        const responseData = await res.json();
        setError(responseData.error || "Failed to post comment");
        return;
      }

      setCommentText("");
      await loadComments();
    } catch {
      setError("Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (commentId: number) => {
    if (!confirm("Delete this comment?") || !data?.pool?.tokenXMint) return;

    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(data.pool.tokenXMint)}/comments?id=${commentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadComments();
      }
    } catch {
      // Ignore
    }
  };

  const pool = data?.pool;
  const lps = data?.lps ?? [];

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-[900px] px-4 pb-10 pt-6 lg:px-6">
        <div className="glass h-32 animate-pulse rounded-[28px]" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass h-16 animate-pulse rounded-[20px]" />
          ))}
        </div>
      </main>
    );
  }

  if (!pool) {
    return (
      <main className="mx-auto max-w-[900px] px-4 pb-10 pt-6 lg:px-6">
        <div className="glass rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">🏊</div>
          <h2 className="mt-2 text-[22px] font-extrabold">Pool not found</h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-mute">
            This pool doesn&apos;t have any active LPs synced yet.
          </p>
          <Link
            href="/pools"
            className="btn-primary mt-5 h-11 px-6 text-[14px]"
          >
            Browse all pools
          </Link>
        </div>
      </main>
    );
  }

  const [x = "?", y = "?"] = [pool.tokenX, pool.tokenY];

  return (
    <main className="mx-auto max-w-[900px] px-4 pb-10 pt-6 lg:px-6">
      <div className="glass rounded-[28px] p-5 sm:p-6">
        {/* Mobile: pair + badges on one line, Dip button below. sm+: button on the right. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div className="flex shrink-0">
              <TokenDot icon={pool.tokenXIcon} label={x} />
              <TokenDot icon={pool.tokenYIcon} label={y} className="-ml-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2 text-[20px] font-extrabold sm:text-[24px]">
                <span className="min-w-0 truncate" data-testid="pool-pair">
                  {pool.tokenXMint ? (
                    <Link href={`/pools?token=${pool.tokenXMint}`} className="hover:underline">{x}</Link>
                  ) : (
                    <span>{x}</span>
                  )}
                  <span>-</span>
                  {pool.tokenYMint ? (
                    <Link href={`/pools?token=${pool.tokenYMint}`} className="hover:underline">{y}</Link>
                  ) : (
                    <span>{y}</span>
                  )}
                </span>
                <span className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] font-semibold uppercase text-mute">
                  DLMM
                </span>
              </div>
              {pool.binStep != null && (
                <div className="mt-1 whitespace-nowrap text-[13px] text-mute">Bin step {pool.binStep}</div>
              )}
            </div>
          </div>
          <a
            href={meteoraPoolUrl(pool.poolAddress, pool.protocol)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center whitespace-nowrap rounded-full border border-border-strong px-5 py-2 text-[14px] font-semibold text-fg-secondary transition hover:bg-surface-raised hover:text-fg"
          >
            Dip in ↗
          </a>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <section>
          <h2 className="text-[18px] font-bold">
            LPs in this pool ({lps.length})
          </h2>
          {lps.length === 0 ? (
            <div className="glass mt-3 rounded-[20px] px-6 py-8 text-center">
              <div className="text-[32px]">🏊</div>
              <p className="mt-2 text-[14px] text-mute">No LPs synced for this pool yet.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {lps.map((lp) => (
                <LPRow key={lp.id} lp={lp} />
              ))}
            </div>
          )}
        </section>

        {pool.tokenXMint && (
          <section className="glass rounded-[28px] p-6">
            <h2 className="mb-4 text-[20px] font-extrabold">
              {pool.tokenX} Thesis Feed ({comments?.comments.length || 0})
            </h2>

            {user ? (
              <CommentComposer
                tokenMint={pool.tokenXMint}
                tokenSymbol={pool.tokenX}
                user={user}
                commentText={commentText}
                setCommentText={setCommentText}
                posting={posting}
                error={error}
                onPost={postComment}
              />
            ) : (
              <div className="mb-6 rounded-2xl border border-border bg-surface-raised px-4 py-3 text-center">
                <p className="text-[14px] text-mute">Sign in to post</p>
              </div>
            )}

            {comments && comments.comments.length === 0 ? (
              <p className="text-[14px] text-mute">
                No theses yet. {user ? "Be the first to share yours!" : ""}
              </p>
            ) : (
              <div className="space-y-4">
                {comments?.comments.map((comment) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    canDelete={user?.id === comment.userId}
                    onDelete={() => deleteComment(comment.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function LPRow({ lp }: { lp: LP }) {
  const pnlTone = (lp.totalPnl ?? 0) >= 0 ? "text-up" : "text-dn";

  return (
    <div className="glass relative flex items-center gap-3 rounded-[20px] px-3 py-2.5 transition hover:bg-surface-raised sm:px-4">
      {/* Row link as an overlay so the Follow button isn't nested inside an anchor. */}
      <Link href={`/profile/${lp.xHandle || lp.id}`} aria-label={`${displayName(lp)}'s profile`} className="absolute inset-0 rounded-[20px]" />
      <Avatar user={lp} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] font-bold">
          <span className="truncate">{displayName(lp)}</span>
          <Flag code={lp.country} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-mute">
          <span>Value {fmtUsd(lp.valueUsd)}</span>
          {lp.totalPnl != null && (
            <>
              <span>·</span>
              <span className={pnlTone}>PnL {fmtUsd(lp.totalPnl, { signed: true })}</span>
            </>
          )}
        </div>
      </div>
      <div className="relative z-10">
        <FollowButton targetUser={lp} size="sm" />
      </div>
    </div>
  );
}

function CommentComposer({
  tokenMint,
  tokenSymbol,
  user,
  commentText,
  setCommentText,
  posting,
  error,
  onPost,
}: {
  tokenMint: string;
  tokenSymbol: string;
  user: { id: number; xHandle: string | null; xName: string | null; xAvatarUrl: string | null };
  commentText: string;
  setCommentText: (text: string) => void;
  posting: boolean;
  error: string | null;
  onPost: () => void;
}) {
  const [hasPosition, setHasPosition] = useState<boolean | null>(null);

  useEffect(() => {
    const checkPosition = async () => {
      try {
        const res = await fetch(`/api/users/${user.id}/open-positions`);
        const posData = await res.json();
        const pools = posData.positions || [];
        const hasPos = pools.some((p: { tokenXMint: string }) => p.tokenXMint === tokenMint);
        setHasPosition(hasPos);
      } catch {
        setHasPosition(false);
      }
    };
    checkPosition();
  }, [user.id, tokenMint]);

  if (hasPosition === false) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-surface-raised px-4 py-3 text-[14px] text-mute">
        <span>Open a position in any {tokenSymbol} pool to share your thesis.</span>
        <a href={meteoraHomeUrl()} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[12px] font-semibold text-mute transition hover:text-fg">
          Meteora ↗
        </a>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarFor(user)}
          alt=""
          className="h-10 w-10 rounded-full border border-surface bg-surface-raised object-cover"
        />
        <div className="min-w-0 flex-1">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={`Share your ${tokenSymbol} thesis...`}
            disabled={posting || hasPosition === null}
            className="w-full rounded-xl border border-border bg-bg p-3 text-[14px] outline-none focus:border-accent disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[12px] text-mute">
              {commentText.length}/500
            </span>
            <button
              type="button"
              onClick={onPost}
              disabled={!commentText.trim() || posting || hasPosition === null}
              className="btn-primary h-9 px-5 text-[13px] disabled:!bg-surface-raised disabled:!text-mute disabled:!opacity-100"
            >
              {posting ? "Posting..." : "Post"}
            </button>
          </div>
          {error && <p className="mt-2 text-[12px] text-dn">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  canDelete,
  onDelete,
}: {
  comment: Comment;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const authorName = displayName(comment.author);
  const profileHref = comment.author.hasProfile ? `/profile/${comment.author.xHandle || comment.author.id}` : null;
  const avatar = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarFor(comment.author)} alt="" className="h-10 w-10 rounded-full border border-surface bg-surface-raised object-cover" />
  );

  return (
    <div className="rounded-2xl border border-border bg-bg p-4">
      <div className="flex gap-3">
        {profileHref ? (
          <Link href={profileHref} className="shrink-0" aria-label={`${authorName}'s profile`} tabIndex={-1} data-testid="comment-author-avatar">
            {avatar}
          </Link>
        ) : (
          <span className="shrink-0">{avatar}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {profileHref ? (
              <Link href={profileHref} className="font-semibold hover:underline" data-testid="comment-author">
                {authorName}
              </Link>
            ) : (
              <span className="font-semibold">{authorName}</span>
            )}
            <span className="text-[12px] text-mute">{timeAgo(comment.createdAt)}</span>
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto text-[12px] text-dn hover:underline"
              >
                Delete
              </button>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-snug">{comment.body}</p>
        </div>
      </div>
    </div>
  );
}
