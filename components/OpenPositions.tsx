"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtUsd } from "@/lib/format";
import { meteoraPoolUrl } from "@/lib/meteora-links";

interface MeteoraOpenPool {
  poolAddress: string;
  binStep: number | null;
  protocol: string | null;
  tokenX: string;
  tokenY: string;
  tokenXMint: string | null;
  tokenYMint: string | null;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  valueUsd: number | null;
  positionCount: number;
}

interface MeteoraOpenPositions {
  totalPositions: number;
  pools: MeteoraOpenPool[];
}

export function OpenPositions({ userId, compact }: { userId?: number; compact?: boolean }) {
  const [data, setData] = useState<MeteoraOpenPositions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/users/${userId}/open-positions`);
        if (!res.ok) {
          throw new Error("Failed to fetch open positions");
        }
        const json = await res.json() as { positions?: MeteoraOpenPool[] };
        if (!cancelled) {
          const pools = Array.isArray(json.positions) ? json.positions : [];
          setData({
            totalPositions: pools.reduce((sum, p) => sum + (p.positionCount || 0), 0),
            pools,
          });
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Could not load open positions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) {
    return null;
  }

  if (loading) {
    return (
      <div className="glass rounded-[28px] p-5">
        <h2 className="text-[14px] font-extrabold uppercase tracking-wide text-mute">Open Positions</h2>
        <p className="mt-3 text-[12px] text-purp-soft">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-[28px] p-5">
        <h2 className="text-[14px] font-extrabold uppercase tracking-wide text-mute">Open Positions</h2>
        <p className="mt-3 text-[12px] text-dn">{error}</p>
      </div>
    );
  }

  if (!data || data.pools.length === 0) {
    return (
      <div className="glass rounded-[28px] p-5">
        <h2 className="text-[14px] font-extrabold uppercase tracking-wide text-mute">Open Positions</h2>
        <p className="mt-3 text-[13px] text-mute">No open positions</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="glass rounded-[28px] p-5">
        <h2 className="mb-3 text-[14px] font-extrabold uppercase tracking-wide text-mute">Open Positions</h2>
        <div className="space-y-2">
          {data.pools.slice(0, 3).map((pool) => (
            <PositionCardCompact key={pool.poolAddress} pool={pool} />
          ))}
        </div>
        {data.pools.length > 3 && (
          <p className="mt-2 text-[11px] text-mute">+{data.pools.length - 3} more</p>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-[28px] p-5">
      <h2 className="mb-4 text-[18px] font-extrabold">
        Open Positions ({data.totalPositions})
      </h2>
      <div className="space-y-3">
        {data.pools.map((pool) => (
          <PositionCard key={pool.poolAddress} pool={pool} />
        ))}
      </div>
    </div>
  );
}

function PositionCard({ pool }: { pool: MeteoraOpenPool }) {
  const value = pool.valueUsd || 0;

  return (
    <div className="relative rounded-2xl border border-white/[.08] bg-gradient-to-br from-white/[.04] to-transparent p-4 transition hover:border-orange/40 hover:bg-white/[.06]">
      <a
        href={`/pools/${pool.poolAddress}`}
        className="block"
      >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center">
            {pool.tokenXIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pool.tokenXIcon} alt={pool.tokenX} className="h-8 w-8 rounded-full border border-base bg-[#222] object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full border border-base bg-[#222]" />
            )}
            {pool.tokenYIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pool.tokenYIcon} alt={pool.tokenY} className="-ml-2 h-8 w-8 rounded-full border border-base bg-[#222] object-cover" />
            ) : (
              <div className="-ml-2 h-8 w-8 rounded-full border border-base bg-[#222]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold">
                {pool.tokenXMint ? (
                  <Link href={`/tokens/${pool.tokenXMint}`} onClick={(e) => e.stopPropagation()} className="hover:text-orange">{pool.tokenX}</Link>
                ) : (
                  <span>{pool.tokenX}</span>
                )}
                <span>/</span>
                {pool.tokenYMint ? (
                  <Link href={`/tokens/${pool.tokenYMint}`} onClick={(e) => e.stopPropagation()} className="hover:text-orange">{pool.tokenY}</Link>
                ) : (
                  <span>{pool.tokenY}</span>
                )}
              </span>
              {pool.binStep && (
                <span className="rounded-full bg-orange/20 px-2 py-0.5 text-[10px] font-bold text-orange">
                  DLMM {pool.binStep}bp
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[12px] text-mute">
              {pool.positionCount || 0} position{pool.positionCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 text-[13px]">
        <div>
          <div className="text-[11px] text-mute">Value</div>
          <div className="num mt-0.5 font-semibold">{fmtUsd(value)}</div>
        </div>
      </div>
      </a>
      
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

function PositionCardCompact({ pool }: { pool: MeteoraOpenPool }) {
  const value = pool.valueUsd || 0;

  return (
    <div className="relative flex items-center justify-between rounded-xl border border-white/[.08] bg-black/20 p-3 transition hover:border-orange/40">
      <a
        href={`/pools/${pool.poolAddress}`}
        className="flex flex-1 items-center gap-2"
      >
        <div className="flex items-center">
          {pool.tokenXIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pool.tokenXIcon} alt={pool.tokenX} className="h-6 w-6 rounded-full border border-base bg-[#222] object-cover" />
          ) : (
            <div className="h-6 w-6 rounded-full border border-base bg-[#222]" />
          )}
          {pool.tokenYIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pool.tokenYIcon} alt={pool.tokenY} className="-ml-1.5 h-6 w-6 rounded-full border border-base bg-[#222] object-cover" />
          ) : (
            <div className="-ml-1.5 h-6 w-6 rounded-full border border-base bg-[#222]" />
          )}
        </div>
        <div className="ml-2">
          <div className="text-[13px] font-semibold">
            {pool.tokenXMint ? (
              <Link href={`/tokens/${pool.tokenXMint}`} onClick={(e) => e.stopPropagation()} className="hover:text-orange">{pool.tokenX}</Link>
            ) : (
              <span>{pool.tokenX}</span>
            )}
            <span>/</span>
            {pool.tokenYMint ? (
              <Link href={`/tokens/${pool.tokenYMint}`} onClick={(e) => e.stopPropagation()} className="hover:text-orange">{pool.tokenY}</Link>
            ) : (
              <span>{pool.tokenY}</span>
            )}
          </div>
          <div className="num text-[11px] text-mute">{fmtUsd(value)}</div>
        </div>
      </a>
      <div className="num mr-2 text-[14px] font-semibold text-white">
        {pool.positionCount || 0}
      </div>
      
      <a
        href={meteoraPoolUrl(pool.poolAddress, pool.protocol || undefined)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="group flex items-center gap-0.5 rounded-full bg-gradient-to-r from-[#FF5C1A] to-[#FF3D7F] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm transition hover:shadow-lg hover:shadow-orange/25"
      >
        <span className="transition group-hover:scale-110">🏖️</span>
      </a>
    </div>
  );
}
