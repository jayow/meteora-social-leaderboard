"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMe } from "@/components/MeProvider";
import { fmtUsd } from "@/lib/format";
import { meteoraPoolUrl } from "@/lib/meteora-links";
import { PoolMemberAvatars } from "@/components/PoolMemberAvatars";
import { onFollowChanged, requestSignIn } from "@/lib/session-events";
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
        className={`h-8 w-8 rounded-full border-2 border-base bg-[#222] object-cover ${className}`}
        loading="lazy"
        onError={() => setFailedIcon(icon)}
      />
    );
  }
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-base bg-purp/40 text-[12px] font-bold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

export default function PoolsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1320px] px-4 py-10 text-mute">Loading...</div>}>
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
  const { verified, sessionChecked } = useMe();
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

  const handleSearch = (term: string) => {
    if (!term.trim()) {
      if (tokenMint) {
        router.push("/pools");
      }
      return;
    }
    
    if (term.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(term)) {
      router.push(`/pools?token=${encodeURIComponent(term)}`);
    } else {
      fetch(`/api/tokens/symbol/${encodeURIComponent(term)}`)
        .then(res => res.json())
        .then(data => {
          if (data.mint) {
            router.push(`/pools?token=${encodeURIComponent(data.mint)}`);
          }
        })
        .catch(() => {});
    }
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
          <Link href="/pools" className="text-[13px] font-semibold text-mute hover:text-white">
            ← All pools
          </Link>
        </div>
      )}
      
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex-1">
          {tokenInfo ? (
            <div className="glass flex items-center gap-4 rounded-[24px] p-4">
              {tokenInfo.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tokenInfo.icon}
                  alt={tokenInfo.symbol}
                  className="h-14 w-14 rounded-full border-2 border-base bg-[#222] object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-base bg-purp/40 text-[20px] font-bold">
                  {tokenInfo.symbol.slice(0, 1)}
                </div>
              )}
              <div>
                <h1 className="text-[28px] font-extrabold">{tokenInfo.symbol} Pools</h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-mute">
                  <span>{tokenInfo.poolCount.toLocaleString("en-US")} pools</span>
                  <span>·</span>
                  <span>{fmtUsd(tokenInfo.totalTvl)} total TVL</span>
                  {tokenInfo.lpCount > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {tokenInfo.lpCount} member LP{tokenInfo.lpCount === 1 ? "" : "s"} ({fmtUsd(tokenInfo.memberLiquidity)})
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
                <span className="brand-text">Pools</span> 🏊
              </h1>
              <p className="mt-1 text-[14px] text-mute">
                All DLMM pools with active LPs · see where your friends are providing liquidity
              </p>
            </>
          )}
        </div>
        {!tokenInfo && (
          <div className="flex flex-wrap items-end justify-between gap-4 sm:flex-nowrap">
            <div className="flex-1">
              <div className="text-[12px] text-mute">Active pools</div>
              <div className="num text-[22px] font-bold">{(pools ?? []).length}</div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch(searchTerm);
              }
            }}
            placeholder="Filter by token symbol or mint address..."
            className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-5 text-[14px] outline-none placeholder:text-mute focus:border-orange/60"
          />
          <button
            type="button"
            onClick={() => handleSearch(searchTerm)}
            className="h-11 rounded-full bg-orange px-6 text-[14px] font-bold hover:bg-orange-soft"
          >
            Filter
          </button>
          {tokenMint && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                router.push("/pools");
              }}
              className="h-11 rounded-full bg-white/[.08] px-5 text-[14px] font-semibold hover:bg-white/[.14]"
            >
              Clear
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {tokenMint && tokenInfo && (
            <input
              type="search"
              value={poolQuery}
              onChange={(e) => setPoolQuery(e.target.value)}
              placeholder={`Search ${tokenInfo.symbol} pools`}
              title="Pair, token mint or pool address"
              aria-label={`Search ${tokenInfo.symbol} pools`}
              className="h-9 min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-4 text-[13px] outline-none placeholder:text-mute focus:border-orange/60 sm:max-w-sm"
            />
          )}
          <label className="ml-auto flex items-center gap-2 text-[12px] text-mute">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                const v = e.target.value;
                if (isPoolSort(v)) setSort(v);
              }}
              className="h-9 rounded-full border border-white/10 bg-black/30 px-3 text-[13px] text-white outline-none focus:border-orange/60"
            >
              {POOL_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {sessionChecked && !verified && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange/25 bg-gradient-to-r from-orange/15 via-pink/10 to-purp/15 px-4 py-3">
          <div className="text-[14px]">
            <span className="font-bold">Sign in to see where your friends LP</span>{" "}
            <span className="text-white/70">Follow friends and discover pools they trust.</span>
          </div>
          <button
            type="button"
            onClick={() => requestSignIn()}
            className="h-9 rounded-full bg-orange px-4 text-[13px] font-bold shadow-lg shadow-orange/25 hover:bg-orange-soft"
          >
            Sign in →
          </button>
        </div>
      )}

      {loading && !pools ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="glass h-20 animate-pulse rounded-[20px]" />
          ))}
        </div>
      ) : visiblePools.length === 0 ? (
        <div className="glass mt-6 rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">🏊</div>
          <h2 className="mt-2 text-[22px] font-extrabold">
            {tokenInfo
              ? debouncedQuery
                ? `No ${tokenInfo.symbol} pools match “${debouncedQuery}”`
                : `No ${tokenInfo.symbol} pools found`
              : "No pools yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-mute">
            {tokenInfo 
              ? "Try another pair, mint or pool address."
              : "Pools will appear here as LPs sync their positions."}
          </p>
        </div>
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
              <div className="text-[12px] text-mute" data-testid="pools-count">
                Showing {visiblePools.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")} pools
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="h-10 rounded-full bg-white/[.08] px-6 text-[14px] font-semibold hover:bg-white/[.14] disabled:opacity-60"
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
    <div className="glass relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] px-3 py-3 transition hover:bg-white/[.06] sm:flex-nowrap sm:px-4" data-testid="pool-row">
      <Link href={`/pools/${pool.poolAddress}`} prefetch={false} className="absolute inset-0 rounded-[20px]" aria-label={`${x}-${y} pool`} />

      <div className="flex shrink-0">
        <TokenDot icon={pool.tokenXIcon} label={x} />
        <TokenDot icon={pool.tokenYIcon} label={y} className="-ml-2" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-[16px] font-bold">
          <span className="min-w-0 truncate">
            {pool.tokenXMint ? (
              <Link href={`/pools?token=${pool.tokenXMint}`} prefetch={false} onClick={(e) => e.stopPropagation()} className="hover:text-orange relative z-10">{x}</Link>
            ) : (
              <span>{x}</span>
            )}
            <span>-</span>
            {pool.tokenYMint ? (
              <Link href={`/pools?token=${pool.tokenYMint}`} prefetch={false} onClick={(e) => e.stopPropagation()} className="hover:text-orange relative z-10">{y}</Link>
            ) : (
              <span>{y}</span>
            )}
          </span>
          <span className="shrink-0 rounded bg-orange/15 px-1.5 text-[10px] font-bold uppercase text-orange">
            DLMM
          </span>
          {pool.binStep != null && (
            <span className="shrink-0 text-[12px] font-medium text-mute">Bin {pool.binStep}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-mute" data-testid="pool-metrics">
          <span className="whitespace-nowrap" data-col="lps">
            {pool.lpCount} LP{pool.lpCount === 1 ? "" : "s"}
            {pool.lpCount > 0 && pool.memberLiquidity != null && (
              <span className="text-white/80"> · {fmtUsd(pool.memberLiquidity)}</span>
            )}
          </span>
          <span>·</span>
          <span className="whitespace-nowrap" data-col="tvl">{fmtUsd(pool.tvl)} TVL</span>
          <span>·</span>
          <span className="whitespace-nowrap" data-col="volume">{fmtUsd(pool.volume24h)} 24h vol</span>
        </div>
      </div>

      {members.length > 0 && (
        // Mobile: own line under the pool name (avatars + label are too wide to share it); desktop: inline.
        <div className="relative z-10 order-last w-full pl-[68px] sm:order-none sm:w-auto sm:shrink-0 sm:pl-0">
          <PoolMemberAvatars poolAddress={pool.poolAddress} members={members} isSignedIn={isSignedIn} />
        </div>
      )}

      <a
        href={meteoraPoolUrl(pool.poolAddress, pool.protocol || undefined)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="group relative z-10 flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-[#FF5C1A] to-[#FF3D7F] px-2.5 py-1 text-[11px] font-bold text-white shadow-md transition hover:shadow-lg hover:shadow-orange/30"
      >
        <span className="transition group-hover:scale-110">🏖️</span>
        <span>Dip in</span>
      </a>
    </div>
  );
}
