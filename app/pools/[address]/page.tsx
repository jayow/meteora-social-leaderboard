"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
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
  totalValueUsd: number | null;
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
}

interface Comment {
  id: number;
  tokenMint: string;
  userId: number;
  body: string;
  createdAt: string;
  author: CommentAuthor;
  poolAddress: string | null;
  tokenY: string | null;
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
        className={`h-12 w-12 rounded-full border-2 border-base bg-[#222] object-cover ${className}`}
        loading="lazy"
      />
    );
  }
  return (
    <span className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-base bg-purp/40 text-[16px] font-bold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

export default function PoolDetailPage() {
  const params = useParams();
  const address = params?.address as string | undefined;
  const { wallet, user } = useMe();
  const { setVisible } = useWalletModal();
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
            className="mt-5 inline-block h-11 rounded-full bg-orange px-6 text-[14px] font-bold leading-[44px] shadow-lg shadow-orange/30 hover:bg-orange-soft"
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
      <div className="glass rounded-[28px] p-6">
        <div className="flex items-center gap-4">
          <div className="flex">
            <TokenDot icon={pool.tokenXIcon} label={x} />
            <TokenDot icon={pool.tokenYIcon} label={y} className="-ml-3" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[24px] font-extrabold">
              <span className="truncate">
                {pool.tokenXMint ? (
                  <Link href={`/pools?token=${pool.tokenXMint}`} className="hover:text-orange">{x}</Link>
                ) : (
                  <span>{x}</span>
                )}
                <span>-</span>
                {pool.tokenYMint ? (
                  <Link href={`/pools?token=${pool.tokenYMint}`} className="hover:text-orange">{y}</Link>
                ) : (
                  <span>{y}</span>
                )}
              </span>
              <span className="shrink-0 rounded bg-orange/15 px-2 py-0.5 text-[11px] font-bold uppercase text-orange">
                DLMM
              </span>
            </div>
            {pool.binStep != null && (
              <div className="mt-1 text-[13px] text-mute">Bin step {pool.binStep}</div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <a
              href={meteoraPoolUrl(pool.poolAddress, pool.protocol || undefined)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FF5C1A] to-[#FF3D7F] px-5 py-2.5 text-[15px] font-bold text-white shadow-lg shadow-orange/30 transition hover:shadow-xl hover:shadow-orange/40"
            >
              <span className="transition group-hover:scale-110">🏖️</span>
              <span>Dip into this pool</span>
            </a>
            <span className="text-[10px] text-mute">Opens Meteora</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-white/[.07] bg-white/[.03] p-4 sm:grid-cols-3">
          <div>
            <div className="text-[11px] font-medium text-mute">Pool Party LPs</div>
            <div className="num mt-0.5 text-[20px] font-bold">{pool.lpCount}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-mute">Total value</div>
            <div className="num mt-0.5 text-[20px] font-bold">{fmtUsd(pool.totalValueUsd)}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[11px] font-medium text-mute">Pool address</div>
            <div className="num mt-0.5 truncate text-[13px] font-medium text-white/70">
              {pool.poolAddress.slice(0, 8)}...{pool.poolAddress.slice(-6)}
            </div>
          </div>
        </div>
      </div>

      {!wallet && lps.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange/25 bg-gradient-to-r from-orange/15 via-pink/10 to-purp/15 px-4 py-3">
          <div className="text-[14px]">
            <span className="font-bold">Connect to follow LPs</span>{" "}
            <span className="text-white/70">Discover who&apos;s providing liquidity in this pool.</span>
          </div>
          <button
            type="button"
            onClick={() => setVisible(true)}
            className="h-9 rounded-full bg-orange px-4 text-[13px] font-bold shadow-lg shadow-orange/25 hover:bg-orange-soft"
          >
            Connect wallet →
          </button>
        </div>
      )}

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
            <p className="mb-4 text-[13px] text-mute">
              Share insights about {pool.tokenX} with other LPs. This feed is shared across all {pool.tokenX} pools.
            </p>

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
              <div className="mb-6 rounded-2xl border border-purp/30 bg-purp/10 px-4 py-3 text-center">
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
    <Link
      href={`/profile/${lp.xHandle || lp.id}`}
      className="glass flex items-center gap-3 rounded-[20px] px-3 py-2.5 transition hover:bg-white/[.06] sm:px-4"
    >
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
      <div onClick={(e) => e.stopPropagation()}>
        <FollowButton targetUser={lp} size="sm" />
      </div>
    </Link>
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
      <div className="mb-6 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-center">
        <p className="text-[14px] text-mute">
          Open a position in any {tokenSymbol} pool to share your thesis
        </p>
        <a
          href={meteoraHomeUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FF5C1A] to-[#FF3D7F] px-4 py-2 text-[13px] font-bold shadow-md hover:shadow-lg hover:shadow-orange/30"
        >
          <span>🏖️</span> Dip in
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
          className="h-10 w-10 rounded-full border border-base bg-[#222] object-cover"
        />
        <div className="min-w-0 flex-1">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={`Share your ${tokenSymbol} thesis...`}
            disabled={posting || hasPosition === null}
            className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-[14px] outline-none focus:border-orange/60 disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[12px] text-mute">
              {commentText.length}/500
            </span>
            <button
              type="button"
              onClick={onPost}
              disabled={!commentText.trim() || posting || hasPosition === null}
              className="h-9 rounded-full bg-orange px-5 text-[13px] font-bold disabled:opacity-60"
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

  return (
    <div className="rounded-2xl border border-white/[.08] bg-black/20 p-4">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarFor(comment.author)}
          alt=""
          className="h-10 w-10 rounded-full border border-base bg-[#222] object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{authorName}</span>
            {comment.poolAddress && comment.tokenY && (
              <Link
                href={`/pools/${comment.poolAddress}`}
                className="flex items-center gap-1 rounded-full bg-white/[.06] px-2 py-0.5 text-[11px] font-semibold text-mute hover:text-white"
              >
                from {comment.tokenY}
              </Link>
            )}
            <span className="text-[12px] text-mute">{timeAgo(comment.createdAt)}</span>
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto text-[12px] text-dn hover:text-dn-soft"
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
