"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtUsd } from "@/lib/format";
import { DipLink } from "@/components/DipLink";

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
        <p className="mt-3 text-[12px] text-mute">Loading...</p>
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
    <div className="relative rounded-2xl border border-border bg-surface-raised p-4 transition hover:border-border-strong">
      {/* Whole-card link as an overlay (not a wrapper) so the token links aren't nested anchors. */}
      <Link href={`/pools/${pool.poolAddress}`} aria-label={`${pool.tokenX}/${pool.tokenY} pool`} className="absolute inset-0 rounded-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center">
            {pool.tokenXIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pool.tokenXIcon} alt={pool.tokenX} className="h-8 w-8 rounded-full border border-surface bg-surface-raised object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full border border-surface bg-surface-raised" />
            )}
            {pool.tokenYIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pool.tokenYIcon} alt={pool.tokenY} className="-ml-2 h-8 w-8 rounded-full border border-surface bg-surface-raised object-cover" />
            ) : (
              <div className="-ml-2 h-8 w-8 rounded-full border border-surface bg-surface-raised" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold">
                {pool.tokenXMint ? (
                  <Link href={`/pools?token=${pool.tokenXMint}`} className="relative z-10 hover:underline">{pool.tokenX}</Link>
                ) : (
                  <span>{pool.tokenX}</span>
                )}
                <span>/</span>
                {pool.tokenYMint ? (
                  <Link href={`/pools?token=${pool.tokenYMint}`} className="relative z-10 hover:underline">{pool.tokenY}</Link>
                ) : (
                  <span>{pool.tokenY}</span>
                )}
              </span>
              {pool.binStep && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-mute">
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

      <DipLink poolAddress={pool.poolAddress} protocol={pool.protocol} className="!absolute right-4 top-4" />
    </div>
  );
}

function PositionCardCompact({ pool }: { pool: MeteoraOpenPool }) {
  const value = pool.valueUsd || 0;

  return (
    <div className="relative flex items-center justify-between rounded-xl border border-border bg-bg p-3 transition hover:border-border-strong">
      <Link href={`/pools/${pool.poolAddress}`} aria-label={`${pool.tokenX}/${pool.tokenY} pool`} className="absolute inset-0 rounded-xl" />
      <div className="flex flex-1 items-center gap-2">
        <div className="flex items-center">
          {pool.tokenXIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pool.tokenXIcon} alt={pool.tokenX} className="h-6 w-6 rounded-full border border-surface bg-surface-raised object-cover" />
          ) : (
            <div className="h-6 w-6 rounded-full border border-surface bg-surface-raised" />
          )}
          {pool.tokenYIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pool.tokenYIcon} alt={pool.tokenY} className="-ml-1.5 h-6 w-6 rounded-full border border-surface bg-surface-raised object-cover" />
          ) : (
            <div className="-ml-1.5 h-6 w-6 rounded-full border border-surface bg-surface-raised" />
          )}
        </div>
        <div className="ml-2">
          <div className="text-[13px] font-semibold">
            {pool.tokenXMint ? (
              <Link href={`/pools?token=${pool.tokenXMint}`} className="relative z-10 hover:underline">{pool.tokenX}</Link>
            ) : (
              <span>{pool.tokenX}</span>
            )}
            <span>/</span>
            {pool.tokenYMint ? (
              <Link href={`/pools?token=${pool.tokenYMint}`} className="relative z-10 hover:underline">{pool.tokenY}</Link>
            ) : (
              <span>{pool.tokenY}</span>
            )}
          </div>
          <div className="num text-[11px] text-mute">{fmtUsd(value)}</div>
        </div>
      </div>
      <div className="num mr-2 text-[14px] font-semibold text-fg">
        {pool.positionCount || 0}
      </div>
      
      <DipLink poolAddress={pool.poolAddress} protocol={pool.protocol} />
    </div>
  );
}
