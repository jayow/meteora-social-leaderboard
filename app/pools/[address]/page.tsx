"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMe } from "@/components/MeProvider";
import { Avatar, Flag, Tag, binLabel } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { avatarFor, displayName, fmtPositions, fmtUsd } from "@/lib/format";
import { meteoraPoolUrl } from "@/lib/meteora-links";
import { applyFollowChange, onFollowChanged } from "@/lib/session-events";
import { ThesisCard } from "@/components/ThesisCard";
import type { ComposerResponse, ThesisPost } from "@/lib/thesis-types";

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
  /** Open positions this LP holds in this pool. */
  positionCount?: number;
  totalPnl: number | null;
  isFollowing: boolean;
}

interface PoolDetailResponse {
  pool: PoolData | null;
  lps: LP[];
}

interface CommentsResponse {
  /** Public theses on this token (all its pools), each tagged with the pool it was posted on. */
  comments: ThesisPost[];
  total?: number;
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
    <span className={`flex h-12 w-12 items-center justify-center rounded-full border-2 border-surface bg-surface-raised text-md font-semibold text-mute ${className}`}>
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
        // A thesis is posted on this exact pool (the API checks you hold it).
        body: JSON.stringify({ body: commentText, poolAddress: data.pool.poolAddress }),
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
  const memberLiquidity = lps.reduce((sum, lp) => sum + (lp.valueUsd ?? 0), 0);

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-[1120px] px-4 pb-10 pt-6 lg:px-6">
        <div className="flex items-center gap-4" aria-busy="true" aria-label="Loading pool">
          <div className="flex shrink-0">
            <span className="skeleton h-12 w-12 rounded-full" />
            <span className="skeleton -ml-3 h-12 w-12 rounded-full" />
          </div>
          <div className="flex-1 space-y-2">
            <span className="skeleton block h-6 w-40" />
            <span className="skeleton block h-4 w-24" />
          </div>
        </div>
        <span className="skeleton mt-8 block h-5 w-40" />
        <div className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border py-2.5">
              <span className="skeleton h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <span className="skeleton block h-4 w-32" />
                <span className="skeleton block h-3 w-48 max-w-full" />
              </div>
              <span className="skeleton h-8 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (!pool) {
    return (
      <main className="mx-auto max-w-[1120px] px-4 pb-10 pt-6 lg:px-6">
        <EmptyState
          title="Pool not found"
          action={
            <Link href="/pools" className="btn-primary">
              Browse all pools
            </Link>
          }
        >
          This pool doesn&apos;t have any active LPs synced yet.
        </EmptyState>
      </main>
    );
  }

  const [x = "?", y = "?"] = [pool.tokenX, pool.tokenY];

  return (
    <main className="mx-auto max-w-[1120px] px-4 pb-10 pt-6 lg:px-6">
      <div>
        {/* Mobile: pair + badges on one line, Dip button below. sm+: button on the right. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div className="flex shrink-0">
              <TokenDot icon={pool.tokenXIcon} label={x} />
              <TokenDot icon={pool.tokenYIcon} label={y} className="-ml-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2 text-2xl font-bold tracking-tight">
                <span className="min-w-0 truncate" data-testid="pool-pair">
                  {pool.tokenXMint ? (
                    <Link href={`/pools?token=${pool.tokenXMint}`} className="underline-offset-2 hover:underline">{x}</Link>
                  ) : (
                    <span>{x}</span>
                  )}
                  <span>-</span>
                  {pool.tokenYMint ? (
                    <Link href={`/pools?token=${pool.tokenYMint}`} className="underline-offset-2 hover:underline">{y}</Link>
                  ) : (
                    <span>{y}</span>
                  )}
                </span>
                <Tag>DLMM</Tag>
              </div>
              <div className="mt-1 overflow-hidden">
                <div className="num dot-list text-base text-mute">
                  {pool.binStep != null && <span>{binLabel(pool.binStep)}</span>}
                  <span>
                    {lps.length} member LP{lps.length === 1 ? "" : "s"}
                  </span>
                  {memberLiquidity > 0 && <span>{fmtUsd(memberLiquidity)} member liquidity</span>}
                </div>
              </div>
            </div>
          </div>
          <a
            href={meteoraPoolUrl(pool.poolAddress, pool.protocol)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Dip in ↗
          </a>
        </div>
      </div>

      {/* Theses lead; LPs are a compact side list (under the theses on phones). */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {pool.tokenXMint && (
          <section className="min-w-0">
            <h2 className="mb-3 text-lg font-semibold">
              {pool.tokenX} theses <span className="num font-medium text-mute">{comments?.total ?? comments?.comments.length ?? 0}</span>
            </h2>

            {user ? (
              <CommentComposer
                poolAddress={pool.poolAddress}
                poolName={`${pool.tokenX}-${pool.tokenY}`}
                tokenSymbol={pool.tokenX}
                user={user}
                commentText={commentText}
                setCommentText={setCommentText}
                posting={posting}
                error={error}
                onPost={postComment}
              />
            ) : (
              <p className="mb-5 text-base text-mute">Sign in to post a thesis.</p>
            )}

            {comments && comments.comments.length === 0 ? (
              <p className="pt-2 text-base text-mute">
                No theses yet.{user ? " Be the first to share yours." : ""}
              </p>
            ) : (
              <div className="space-y-2">
                {comments?.comments.map((comment) => (
                  <div key={comment.id} className="py-4">
                    <ThesisCard post={comment} onDelete={comment.isOwn ? () => deleteComment(comment.id) : undefined} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <LpList lps={lps} />
      </div>
    </main>
  );
}

const LP_PREVIEW = 8;

/** Compact LP list: who's in and how big, one short row each. Follow lives on profiles and hover cards. */
function LpList({ lps }: { lps: LP[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? lps : lps.slice(0, LP_PREVIEW);
  return (
    <aside className="lg:sticky lg:top-[84px]">
      <h2 className="text-md font-semibold">
        LPs in this pool <span className="num font-medium text-mute">{lps.length}</span>
      </h2>
      {lps.length === 0 ? (
        <p className="mt-2 text-base text-mute">No LPs synced for this pool yet.</p>
      ) : (
        <ul className="mt-2">
          {shown.map((lp) => (
            <li key={lp.id}>
              <LPRow lp={lp} />
            </li>
          ))}
        </ul>
      )}
      {lps.length > LP_PREVIEW && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-ghost mt-1 h-8 w-full px-3">
          {showAll ? "Show fewer" : `Show all ${lps.length}`}
        </button>
      )}
    </aside>
  );
}

function LPRow({ lp }: { lp: LP }) {
  const pnlTone = (lp.totalPnl ?? 0) >= 0 ? "text-up" : "text-dn";
  return (
    <Link
      href={`/profile/${lp.xHandle || lp.id}`}
      className="-mx-2 flex items-center gap-2.5 rounded-tile px-2 py-2 transition hover:bg-accent-tint"
      title={(lp.positionCount ?? 1) > 1 ? fmtPositions(lp.positionCount ?? 1) : undefined}
    >
      <Avatar user={lp} size={28} />
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-base font-medium text-fg">
        <span className="truncate">{displayName(lp)}</span>
        <Flag code={lp.country} className="shrink-0" />
      </span>
      <span className="shrink-0 text-right">
        <span className="num block text-base font-semibold text-fg">{fmtUsd(lp.valueUsd)}</span>
        {lp.totalPnl != null && <span className={`num block text-xs ${pnlTone}`}>{fmtUsd(lp.totalPnl, { signed: true })}</span>}
      </span>
    </Link>
  );
}

function CommentComposer({
  poolAddress,
  poolName,
  tokenSymbol,
  user,
  commentText,
  setCommentText,
  posting,
  error,
  onPost,
}: {
  poolAddress: string;
  poolName: string;
  tokenSymbol: string;
  user: { id: number; xHandle: string | null; xName: string | null; xAvatarUrl: string | null };
  commentText: string;
  setCommentText: (text: string) => void;
  posting: boolean;
  error: string | null;
  onPost: () => void;
}) {
  // Same rule as the comments API: joined member with a position in THIS pool (lib/theses.ts).
  const [gate, setGate] = useState<"loading" | "ok" | "not_joined" | "no_position">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/api/poolside/composer", { cache: "no-store" })
      .then((r) => r.json() as Promise<ComposerResponse>)
      .then((d) => {
        if (!alive) return;
        if (!d.joined) setGate("not_joined");
        else setGate(d.pools.some((p) => p.address === poolAddress) ? "ok" : "no_position");
      })
      .catch(() => alive && setGate("no_position"));
    return () => {
      alive = false;
    };
  }, [user.id, poolAddress]);
  const hasPosition = gate === "loading" ? null : gate === "ok";

  if (gate === "not_joined") {
    return (
      <div className="mb-5 text-base text-mute">
        Posting is for beta members.{" "}
        <Link href="/join" className="link">
          Redeem an invite code
        </Link>{" "}
        to share a thesis.
      </div>
    );
  }

  if (gate === "no_position") {
    return (
      <div className="mb-5 text-base text-mute">
        <span>Hold a position in {poolName} to post a thesis on this pool.</span>
      </div>
    );
  }

  return (
    <div className="mb-5">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarFor(user)}
          alt=""
          className="hidden h-10 w-10 shrink-0 rounded-full border border-border bg-surface-raised object-cover sm:block"
        />
        <div className="min-w-0 flex-1">
          {/* One bubble: the text and its Post button share the field, so the action sits with the words. */}
          <div className="rounded-tile border border-border bg-surface-raised transition hover:border-border-strong focus-within:border-transparent focus-within:outline focus-within:outline-2 focus-within:outline-accent">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={`Share your ${tokenSymbol} thesis…`}
              disabled={posting || hasPosition === null}
              aria-label={`Your ${tokenSymbol} thesis`}
              className="block w-full resize-none bg-transparent px-3.5 pt-2.5 text-base text-fg outline-none placeholder:text-mute"
            />
            <div className="flex items-center justify-end gap-3 px-2 pb-2">
              {/* The counter appears only near the limit. */}
              <span className="num text-sm text-mute">{commentText.length >= 400 ? `${commentText.length}/500` : ""}</span>
              <button
                type="button"
                onClick={onPost}
                disabled={!commentText.trim() || posting || hasPosition === null}
                className="btn-primary h-8 px-3"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
          {error && <p className="mt-2 text-base text-dn">{error}</p>}
        </div>
      </div>
    </div>
  );
}
