"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMe } from "@/components/MeProvider";
import { avatarFor, fmtUsd, timeAgo } from "@/lib/format";
import { meteoraPoolUrl, meteoraHomeUrl } from "@/lib/meteora-links";

interface TokenInfo {
  mint: string;
  symbol: string;
  icon: string | null;
  poolCount: number;
  totalTvl: number;
  memberLiquidity: number;
  lpCount: number;
}

interface PoolData {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string;
  tokenYMint: string;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  protocol: string;
  tvl: number | null;
  volume24h: number | null;
  fees24h: number | null;
  apr: number | null;
  memberCount: number;
  memberLiquidity: number;
}

interface CommentAuthor {
  id: number;
  xHandle: string | null;
  xName: string | null;
  xAvatarUrl: string | null;
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

interface TokenResponse {
  token: TokenInfo | null;
  pools: PoolData[];
}

interface CommentsResponse {
  comments: Comment[];
}

export default function TokenPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1200px] px-4 py-10">Loading...</div>}>
      <TokenDetail />
    </Suspense>
  );
}

function TokenDetail() {
  const params = useParams<{ mint: string }>();
  const mint = decodeURIComponent(params.mint);
  const { user } = useMe();

  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [comments, setComments] = useState<CommentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadToken = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(mint)}`, { cache: "no-store" });
      if (!res.ok) {
        setTokenData({ token: null, pools: [] });
      } else {
        setTokenData((await res.json()) as TokenResponse);
      }
    } catch {
      setTokenData({ token: null, pools: [] });
    } finally {
      setLoading(false);
    }
  }, [mint]);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(mint)}/comments`, { cache: "no-store" });
      setComments((await res.json()) as CommentsResponse);
    } catch {
      setComments({ comments: [] });
    }
  }, [mint]);

  useEffect(() => {
    loadToken();
    loadComments();
  }, [loadToken, loadComments]);

  const postComment = async () => {
    if (!commentText.trim()) return;

    setPosting(true);
    setError(null);

    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(mint)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to post comment");
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
    if (!confirm("Delete this comment?")) return;

    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(mint)}/comments?id=${commentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadComments();
      }
    } catch {
      // Ignore
    }
  };

  if (loading || !tokenData) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-10">
        <div className="glass h-64 animate-pulse rounded-[28px]" />
      </main>
    );
  }

  const { token, pools } = tokenData;

  if (!token) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-10">
        <div className="glass rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">💎</div>
          <h2 className="mt-2 text-[22px] font-extrabold">Token not found</h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-mute">
            This token doesn&apos;t have any active Meteora positions yet.
          </p>
          <Link href="/tokens" className="mt-4 inline-block text-orange">
            ← Back to tokens
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 lg:px-6">
      <div className="mb-4">
        <Link href="/tokens" className="text-[13px] font-semibold text-mute hover:text-white">
          ← Tokens
        </Link>
      </div>

      <div className="glass rounded-[28px] p-6">
        <div className="flex items-center gap-4">
          {token.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.icon}
              alt={token.symbol}
              className="h-16 w-16 rounded-full border-2 border-base bg-[#222] object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-base bg-purp/40 text-[24px] font-bold">
              {token.symbol.slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-[32px] font-extrabold">{token.symbol}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-mute">
              <span>{token.poolCount} pools</span>
              <span>·</span>
              <span>{fmtUsd(token.totalTvl)} TVL</span>
              {token.memberLiquidity > 0 && (
                <>
                  <span>·</span>
                  <span>{fmtUsd(token.memberLiquidity)} member liquidity</span>
                </>
              )}
              {token.lpCount > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {token.lpCount} LP{token.lpCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <section className="glass rounded-[28px] p-6">
          <h2 className="mb-4 text-[20px] font-extrabold">Pools</h2>
          {pools.length === 0 ? (
            <p className="text-[14px] text-mute">No pools found</p>
          ) : (
            <div className="space-y-3">
              {pools.map((pool) => (
                <PoolCard key={pool.poolAddress} pool={pool} />
              ))}
            </div>
          )}
        </section>

        <section className="glass rounded-[28px] p-6">
          <h2 className="mb-4 text-[20px] font-extrabold">
            Thesis & Discussion ({comments?.comments.length || 0})
          </h2>

          {user ? (
            <CommentComposer
              token={token}
              user={user}
              commentText={commentText}
              setCommentText={setCommentText}
              posting={posting}
              error={error}
              onPost={postComment}
            />
          ) : (
            <div className="mb-6 rounded-2xl border border-purp/30 bg-purp/10 px-4 py-3 text-center">
              <p className="text-[14px] text-mute">Sign in to share your thesis</p>
              <div className="mt-3 flex justify-center gap-2">
                <Link
                  href="/api/x/login?returnTo=/tokens"
                  className="flex h-9 items-center gap-1.5 rounded-full bg-purp/25 px-4 text-[13px] font-bold text-purp-soft hover:bg-purp/35"
                >
                  Sign in with X
                </Link>
                <Link
                  href="/profile/me"
                  className="h-9 rounded-full bg-white/[.06] px-4 text-[13px] font-bold leading-9 hover:bg-white/[.12]"
                >
                  Sign in with wallet
                </Link>
              </div>
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
      </div>
    </main>
  );
}

function PoolCard({ pool }: { pool: PoolData }) {
  return (
    <div className="relative rounded-2xl border border-white/[.08] bg-gradient-to-br from-white/[.04] to-transparent p-4 transition hover:border-orange/40 hover:bg-white/[.06]">
      <Link href={`/pools/${pool.poolAddress}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center">
              {pool.tokenXIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pool.tokenXIcon}
                  alt={pool.tokenX}
                  className="h-8 w-8 rounded-full border border-base bg-[#222] object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full border border-base bg-[#222]" />
              )}
              {pool.tokenYIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pool.tokenYIcon}
                  alt={pool.tokenY}
                  className="-ml-2 h-8 w-8 rounded-full border border-base bg-[#222] object-cover"
                />
              ) : (
                <div className="-ml-2 h-8 w-8 rounded-full border border-base bg-[#222]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold">
                  {pool.tokenX}/{pool.tokenY}
                </span>
                {pool.binStep && (
                  <span className="rounded-full bg-orange/20 px-2 py-0.5 text-[10px] font-bold text-orange">
                    DLMM {pool.binStep}bp
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-mute">
                <span>{fmtUsd(pool.tvl)} TVL</span>
                {pool.volume24h && (
                  <>
                    <span>·</span>
                    <span>{fmtUsd(pool.volume24h)} 24h vol</span>
                  </>
                )}
                {pool.apr && (
                  <>
                    <span>·</span>
                    <span className="text-up">{pool.apr.toFixed(2)}% APR</span>
                  </>
                )}
                {pool.memberCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="font-semibold text-orange">
                      {pool.memberCount} friend{pool.memberCount === 1 ? "" : "s"} here
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>

      <a
        href={meteoraPoolUrl(pool.poolAddress, pool.protocol || undefined)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="group absolute right-3 top-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FF5C1A] to-[#FF3D7F] px-2.5 py-1 text-[11px] font-bold text-white shadow-md transition hover:shadow-lg hover:shadow-orange/30"
      >
        <span className="transition group-hover:scale-110">🏖️</span>
        <span>Dip in</span>
      </a>
    </div>
  );
}

function CommentComposer({
  token,
  user,
  commentText,
  setCommentText,
  posting,
  error,
  onPost,
}: {
  token: TokenInfo;
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
        const data = await res.json();
        const pools = data.positions || [];
        const hasPos = pools.some((p: { tokenXMint: string }) => p.tokenXMint === token.mint);
        setHasPosition(hasPos);
      } catch {
        setHasPosition(false);
      }
    };
    checkPosition();
  }, [user.id, token.mint]);

  if (hasPosition === false) {
    return (
      <div className="mb-6 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-center">
        <p className="text-[14px] text-mute">
          Open a position in a {token.symbol} pool to share your thesis
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
            placeholder={`Share your ${token.symbol} thesis...`}
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
  const authorName = comment.author.xHandle
    ? `@${comment.author.xHandle}`
    : comment.author.xName || `LP #${comment.author.id}`;

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
                LP in {comment.tokenY}
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
