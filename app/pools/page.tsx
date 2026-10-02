"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMe } from "@/components/MeProvider";
import { fmtUsd } from "@/lib/format";
import { DipLink } from "@/components/DipLink";
import { EmptyState, PageHeader } from "@/components/EmptyState";
import { binLabel } from "@/components/ui";
import { PoolMemberAvatars } from "@/components/PoolMemberAvatars";
import { onFollowChanged } from "@/lib/session-events";
import {
  POOL_SORTS,
  comparePoolRows,
  isPoolSort,
  type PoolListRow,
  type PoolSort,
  type TokenPoolsResponse,
  type TokenSummary,
} from "@/lib/pool-list";

type PoolData = PoolListRow;

interface PoolsResponse {
  pools: PoolData[];
}

interface Member {
  userId: number;
  xAvatarUrl: string | null;
  xHandle: string | null;
  anonName?: string | null;
  isFollowed: boolean;
}

interface PoolMembersResponse {
  pools: Array<{
    poolAddress: string;
    members: Member[];
  }>;
}

const PAGE_SIZE = 50;

function TokenDot({ icon, label, className = "" }: { icon: string | null; label: string; className?: string }) {
  // Some token icons (e.g. ipfs.io) refuse cross-origin embedding: fall back to the letter.
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  if (icon && failedIcon !== icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={label}
        className={`h-8 w-8 rounded-full border-2 border-surface bg-surface-raised object-cover ${className}`}
        loading="lazy"
        onError={() => setFailedIcon(icon)}
      />
    );
  }
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-border-strong text-sm font-bold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

export default function PoolsPage() {
  return (
    <Suspense fallback={<PoolsSkeleton />}>
      <PoolsContent />
    </Suspense>
  );
}

/** Avatars for pools that have members (token pages can list thousands of pools without any). */
async function fetchMembers(rows: PoolData[]): Promise<Map<string, Member[]>> {
  const addresses = rows.filter((p) => p.lpCount > 0).map((p) => p.poolAddress);
  const out = new Map<string, Member[]>();
  if (addresses.length === 0) return out;
  const res = await fetch(`/api/pools/members?pools=${encodeURIComponent(addresses.join(","))}`, { cache: "no-store" });
  if (!res.ok) return out;
  const body = (await res.json()) as PoolMembersResponse;
  for (const pool of body.pools || []) out.set(pool.poolAddress, pool.members);
  return out;
}

function PoolsContent() {
  const { verified } = useMe();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenMint = searchParams.get("token");
  const sortFromUrl = searchParams.get("sort");

  const [pools, setPools] = useState<PoolData[] | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenSummary | null>(null);
  const [membersData, setMembersData] = useState<Map<string, Member[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMiss, setSearchMiss] = useState<string | null>(null);
  const [sort, setSort] = useState<PoolSort>(isPoolSort(sortFromUrl) ? sortFromUrl : "members");
  // Token view: filter within the token's pools (server-side, debounced)
  const [poolQuery, setPoolQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const requestId = useRef(0);

  // Friends-first avatars / "N friends here" reflect follows made elsewhere without a reload.
  useEffect(
    () =>
      onFollowChanged((change) =>
        setMembersData((prev) => {
          let changed = false;
          const next = new Map<string, Member[]>();
          prev.forEach((members, pool) => {
            next.set(
              pool,
              members.map((m) => {
                if (m.userId !== change.targetId || m.isFollowed === change.following) return m;
                changed = true;
                return { ...m, isFollowed: change.following };
              })
            );
          });
          return changed ? next : prev;
        })
      ),
    []
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(poolQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [poolQuery]);

  // New token: reset the in-token filter
  useEffect(() => {
    setPoolQuery("");
    setDebouncedQuery("");
  }, [tokenMint]);

  const tokenUrl = useCallback(
    (offset: number): string => {
      const qs = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE), sort });
      if (debouncedQuery) qs.set("q", debouncedQuery);
      return `/api/tokens/${encodeURIComponent(tokenMint || "")}?${qs.toString()}`;
    },
    [tokenMint, sort, debouncedQuery]
  );

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      if (tokenMint) {
        const res = await fetch(tokenUrl(0), { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as TokenPoolsResponse | null;
        if (id !== requestId.current) return;
        if (!res.ok || !body) {
          setPools([]);
          setTokenInfo(body?.token ?? null);
          setTotal(0);
          setHasMore(false);
          return;
        }
        setTokenInfo(body.token);
        setPools(body.pools);
        setTotal(body.total);
        setHasMore(body.hasMore);
        const members = await fetchMembers(body.pools);
        if (id === requestId.current) setMembersData(members);
      } else {
        const res = await fetch("/api/pools", { cache: "no-store" });
        const body = res.ok ? ((await res.json()) as PoolsResponse) : { pools: [] };
        if (id !== requestId.current) return;
        setTokenInfo(null);
        setPools(body.pools);
        setTotal(body.pools.length);
        setHasMore(false);
        const members = await fetchMembers(body.pools);
        if (id === requestId.current) setMembersData(members);
      }
    } catch {
      if (id === requestId.current) {
        setPools([]);
        setTokenInfo(null);
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [tokenMint, tokenUrl]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (!tokenMint || !pools || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const res = await fetch(tokenUrl(pools.length), { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as TokenPoolsResponse;
      if (id !== requestId.current) return;
      setPools((prev) => {
        const seen = new Set((prev || []).map((p) => p.poolAddress));
        return [...(prev || []), ...body.pools.filter((p) => !seen.has(p.poolAddress))];
      });
      setTotal(body.total);
      setHasMore(body.hasMore);
      const members = await fetchMembers(body.pools);
      if (id === requestId.current && members.size > 0) {
        setMembersData((prev) => new Map([...prev, ...members]));
      }
    } catch {
      // keep what we have; the button stays available
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSearch = (raw: string) => {
    const term = raw.trim();
    setSearchMiss(null);
    if (!term) return;
    if (term.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(term)) {
      router.push(`/pools?token=${encodeURIComponent(term)}`);
      return;
    }
    fetch(`/api/tokens/symbol/${encodeURIComponent(term)}`)
      .then((res) => res.json())
      .then((data: { mint?: string }) => {
        if (data.mint) router.push(`/pools?token=${encodeURIComponent(data.mint)}`);
        else setSearchMiss(term);
      })
      .catch(() => setSearchMiss(term));
  };

  // All-pools view returns its full set (member pools, max 100): sort it here. Token view sorts server-side.
  const visiblePools = useMemo(() => {
    const list = pools ?? [];
    if (tokenMint || sort === "members") return list; // members: server order (friends, LPs, value)
    return [...list].sort(comparePoolRows(sort));
  }, [pools, tokenMint, sort]);

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      {tokenMint && tokenInfo && (
        <div className="mb-4">
          <Link href="/pools" className="rounded-tag text-base font-semibold text-mute transition hover:text-fg">
            ← All pools
          </Link>
        </div>
      )}
      
      {tokenInfo ? (
        <div className="flex items-center gap-4">
          {tokenInfo.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tokenInfo.icon}
              alt={tokenInfo.symbol}
              className="h-12 w-12 shrink-0 rounded-full border border-border bg-surface-raised object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-lg font-semibold text-mute">
              {tokenInfo.symbol.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{tokenInfo.symbol} pools</h1>
            <div className="mt-1 overflow-hidden">
              <div className="num dot-list text-base text-mute">
                <span>{tokenInfo.poolCount.toLocaleString("en-US")} pools</span>
                <span>{fmtUsd(tokenInfo.totalTvl)} total TVL</span>
                {tokenInfo.lpCount > 0 && (
                  <span>
                    {tokenInfo.lpCount} member LP{tokenInfo.lpCount === 1 ? "" : "s"} ({fmtUsd(tokenInfo.memberLiquidity)})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <PageHeader
          title={
            <>
              Pools{pools ? <span className="num font-medium text-mute"> {pools.length}</span> : null}
            </>
          }
          description="Every DLMM pool with active member LPs. See where your friends are providing liquidity."
        />
      )}

      {/* One search field: across all pools it finds a token (Enter); inside a token it filters that token's pools. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {tokenMint && tokenInfo ? (
          <input
            type="search"
            value={poolQuery}
            onChange={(e) => setPoolQuery(e.target.value)}
            placeholder={`Search ${tokenInfo.symbol} pools`}
            title="Pair, token mint or pool address"
            aria-label={`Search ${tokenInfo.symbol} pools`}
            className="field h-9 min-w-0 flex-1 px-3 sm:max-w-sm"
          />
        ) : (
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSearchMiss(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch(searchTerm);
            }}
            placeholder="Find a token by symbol or mint, then Enter"
            aria-label="Find a token by symbol or mint address"
            className="field h-9 min-w-0 flex-1 px-3 sm:max-w-sm"
          />
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-mute">
          Sort
          <select
            value={sort}
            onChange={(e) => {
              const v = e.target.value;
              if (isPoolSort(v)) setSort(v);
            }}
            className="field h-9 w-auto px-3"
          >
            {POOL_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {searchMiss && (
        <p className="mt-2 text-sm text-mute" role="status">
          No token called “{searchMiss}”. Try its mint address.
        </p>
      )}

      {loading && !pools ? (
        <PoolRowsSkeleton />
      ) : visiblePools.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={
            tokenInfo
              ? debouncedQuery
                ? `No ${tokenInfo.symbol} pools match “${debouncedQuery}”`
                : `No ${tokenInfo.symbol} pools found`
              : "No pools yet"
          }
        >
          {tokenInfo ? "Try another pair, mint or pool address." : "Pools will appear here as LPs sync their positions."}
        </EmptyState>
      ) : (
        <>
          <div className={`mt-6 space-y-2 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {visiblePools.map((p) => (
              <PoolRow
                key={p.poolAddress}
                pool={p}
                members={membersData.get(p.poolAddress) || []}
                isSignedIn={verified}
              />
            ))}
          </div>
          {tokenMint && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="num text-sm text-mute" data-testid="pools-count">
                Showing {visiblePools.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")} pools
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="btn-secondary"
                >
                  {loadingMore ? "Loading…" : `Show ${Math.min(PAGE_SIZE, total - visiblePools.length)} more`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

function PoolRow({
  pool,
  members,
  isSignedIn,
}: {
  pool: PoolData;
  members: Member[];
  isSignedIn: boolean;
}) {
  const [x = "?", y = "?"] = [pool.tokenX, pool.tokenY];

  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-tile border border-border bg-surface px-3 py-2.5 transition hover:border-border-strong sm:flex-nowrap sm:px-4" data-testid="pool-row">
      <Link href={`/pools/${pool.poolAddress}`} prefetch={false} className="absolute inset-0 rounded-tile" aria-label={`${x}-${y} pool`} />

      <div className="flex w-14 shrink-0">
        <TokenDot icon={pool.tokenXIcon} label={x} />
        <TokenDot icon={pool.tokenYIcon} label={y} className="-ml-2" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-md font-semibold">
          <span className="min-w-0 truncate">
            {pool.tokenXMint ? (
              <Link href={`/pools?token=${pool.tokenXMint}`} prefetch={false} onClick={(e) => e.stopPropagation()} className="relative z-10 underline-offset-2 hover:underline">{x}</Link>
            ) : (
              <span>{x}</span>
            )}
            <span>-</span>
            {pool.tokenYMint ? (
              <Link href={`/pools?token=${pool.tokenYMint}`} prefetch={false} onClick={(e) => e.stopPropagation()} className="relative z-10 underline-offset-2 hover:underline">{y}</Link>
            ) : (
              <span>{y}</span>
            )}
          </span>
          {pool.binStep != null && <span className="shrink-0 text-sm font-medium text-mute">{binLabel(pool.binStep)}</span>}
        </div>
        <div className="mt-0.5 overflow-hidden">
          <div className="num dot-list text-sm text-mute" data-testid="pool-metrics">
            <span data-col="lps">
              {pool.lpCount} LP{pool.lpCount === 1 ? "" : "s"}
              {pool.lpCount > 0 && pool.memberLiquidity != null && <span className="text-fg-secondary"> ({fmtUsd(pool.memberLiquidity)})</span>}
            </span>
            <span data-col="tvl">{fmtUsd(pool.tvl)} TVL</span>
            <span data-col="volume">{fmtUsd(pool.volume24h)} 24h vol</span>
          </div>
        </div>
      </div>

      {members.length > 0 && (
        // Mobile: own line under the pool name, indented past the token icons (w-14 + gap-3); desktop: inline.
        <div className="relative z-10 order-last w-full pl-17 sm:order-none sm:w-auto sm:shrink-0 sm:pl-0">
          <PoolMemberAvatars poolAddress={pool.poolAddress} members={members} isSignedIn={isSignedIn} />
        </div>
      )}

      <DipLink poolAddress={pool.poolAddress} protocol={pool.protocol} />
    </div>
  );
}

/** Same footprint as a pool row (icons, two text lines), so nothing jumps when the list arrives. */
function PoolRowsSkeleton() {
  return (
    <div className="mt-6 space-y-2" aria-busy="true" aria-label="Loading pools">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-tile border border-border bg-surface px-3 py-2.5 sm:px-4">
          <div className="flex w-14 shrink-0">
            <span className="skeleton h-8 w-8 rounded-full" />
            <span className="skeleton -ml-2 h-8 w-8 rounded-full" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <span className="skeleton block h-4 w-36" />
            <span className="skeleton block h-3 w-56 max-w-full" />
          </div>
          <span className="skeleton hidden h-3 w-12 sm:block" />
        </div>
      ))}
    </div>
  );
}

function PoolsSkeleton() {
  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <span className="skeleton block h-8 w-32" />
      <span className="skeleton mt-2 block h-4 w-80 max-w-full" />
      <span className="skeleton mt-5 block h-9 w-full rounded-tile sm:max-w-sm" />
      <PoolRowsSkeleton />
    </main>
  );
}
