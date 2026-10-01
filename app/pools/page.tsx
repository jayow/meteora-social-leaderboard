"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMe } from "@/components/MeProvider";
import { fmtUsd } from "@/lib/format";
import { meteoraPoolUrl } from "@/lib/meteora-links";
import { PoolMemberAvatars } from "@/components/PoolMemberAvatars";
import { onFollowChanged, requestSignIn } from "@/lib/session-events";

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
  friendsCount: number;
  friendAvatars: string[];
  friendHandles: string[];
}

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

function TokenDot({ icon, label, className = "" }: { icon: string | null; label: string; className?: string }) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={label}
        className={`h-8 w-8 rounded-full border-2 border-base bg-[#222] object-cover ${className}`}
        loading="lazy"
      />
    );
  }
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-base bg-purp/40 text-[12px] font-bold ${className}`}>
      {label.slice(0, 1)}
    </span>
  );
}

interface TokenInfo {
  mint: string;
  symbol: string;
  icon: string | null;
  poolCount: number;
  totalTvl: number;
}

export default function PoolsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1320px] px-4 py-10 text-mute">Loading...</div>}>
      <PoolsContent />
    </Suspense>
  );
}

function PoolsContent() {
  const { verified, sessionChecked } = useMe();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenMint = searchParams.get("token");
  
  const [data, setData] = useState<PoolsResponse | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [membersData, setMembersData] = useState<Map<string, Member[]>>(new Map());

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
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = tokenMint 
        ? `/api/tokens/${encodeURIComponent(tokenMint)}`
        : "/api/pools";
      
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setData({ pools: [] });
        setTokenInfo(null);
        return;
      }
      
      const result = await res.json();
      
      if (tokenMint && result.token && result.pools) {
        setTokenInfo({
          mint: result.token.mint,
          symbol: result.token.symbol,
          icon: result.token.icon,
          poolCount: result.token.poolCount,
          totalTvl: result.token.totalTvl,
        });
        setData({ pools: result.pools });
      } else {
        setData(result as PoolsResponse);
        setTokenInfo(null);
      }

      const pools = tokenMint ? result.pools : (result as PoolsResponse).pools;
      if (pools && pools.length > 0) {
        const poolAddresses = pools.map((p: PoolData) => p.poolAddress).join(",");
        const membersRes = await fetch(`/api/pools/members?pools=${encodeURIComponent(poolAddresses)}`, {
          cache: "no-store",
        });
        const membersResult = (await membersRes.json()) as PoolMembersResponse;
        
        const membersMap = new Map<string, Member[]>();
        for (const pool of membersResult.pools) {
          membersMap.set(pool.poolAddress, pool.members);
        }
        setMembersData(membersMap);
      }
    } catch {
      setData({ pools: [] });
      setTokenInfo(null);
    } finally {
      setLoading(false);
    }
  }, [tokenMint]);

  useEffect(() => {
    load();
  }, [load]);

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

  const pools = data?.pools ?? [];

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
                  <span>{tokenInfo.poolCount} pools</span>
                  <span>·</span>
                  <span>{fmtUsd(tokenInfo.totalTvl)} total TVL</span>
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
              <div className="num text-[22px] font-bold">{pools.length}</div>
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
            className="h-11 flex-1 rounded-full border border-white/10 bg-black/30 px-5 text-[14px] outline-none placeholder:text-mute focus:border-orange/60"
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

      {loading && !data ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="glass h-20 animate-pulse rounded-[20px]" />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <div className="glass mt-6 rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">🏊</div>
          <h2 className="mt-2 text-[22px] font-extrabold">
            {tokenInfo ? `No ${tokenInfo.symbol} pools found` : "No pools yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-mute">
            {tokenInfo 
              ? "This token doesn't have any active Meteora positions yet."
              : "Pools will appear here as LPs sync their positions."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {pools.map((p) => (
            <PoolRow
              key={p.poolAddress}
              pool={p}
              members={membersData.get(p.poolAddress) || []}
              isSignedIn={verified}
            />
          ))}
        </div>
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
    <div className="glass relative flex items-center gap-3 rounded-[20px] px-3 py-3 transition hover:bg-white/[.06] sm:px-4">
      <Link href={`/pools/${pool.poolAddress}`} className="absolute inset-0 rounded-[20px]" />

      <div className="flex">
        <TokenDot icon={pool.tokenXIcon} label={x} />
        <TokenDot icon={pool.tokenYIcon} label={y} className="-ml-2" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[16px] font-bold">
          <span className="truncate">
            {pool.tokenXMint ? (
              <Link href={`/pools?token=${pool.tokenXMint}`} onClick={(e) => e.stopPropagation()} className="hover:text-orange relative z-10">{x}</Link>
            ) : (
              <span>{x}</span>
            )}
            <span>-</span>
            {pool.tokenYMint ? (
              <Link href={`/pools?token=${pool.tokenYMint}`} onClick={(e) => e.stopPropagation()} className="hover:text-orange relative z-10">{y}</Link>
            ) : (
              <span>{y}</span>
            )}
          </span>
          <span className="shrink-0 rounded bg-orange/15 px-1.5 text-[10px] font-bold uppercase text-orange">
            DLMM
          </span>
          {pool.binStep != null && (
            <span className="text-[12px] font-medium text-mute">Bin {pool.binStep}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-mute">
          <span>
            {pool.lpCount} LP{pool.lpCount === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>{fmtUsd(pool.totalValueUsd)} TVL</span>
        </div>
      </div>

      {members.length > 0 && (
        <div className="relative z-10">
          <PoolMemberAvatars poolAddress={pool.poolAddress} members={members} isSignedIn={isSignedIn} />
        </div>
      )}

      <a
        href={meteoraPoolUrl(pool.poolAddress, pool.protocol || undefined)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="group relative z-10 flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FF5C1A] to-[#FF3D7F] px-2.5 py-1 text-[11px] font-bold text-white shadow-md transition hover:shadow-lg hover:shadow-orange/30"
      >
        <span className="transition group-hover:scale-110">🏖️</span>
        <span>Dip in</span>
      </a>
    </div>
  );
}
