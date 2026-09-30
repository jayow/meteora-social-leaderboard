"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMe } from "@/components/MeProvider";
import { Avatar, Flag } from "@/components/ui";
import { FollowButton } from "@/components/FollowButton";
import { displayName, fmtUsd } from "@/lib/format";
import { meteoraPoolUrl } from "@/lib/meteora-links";

interface PoolData {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
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
  country: string | null;
  valueUsd: number | null;
  totalPnl: number | null;
  isFollowing: boolean;
}

interface PoolDetailResponse {
  pool: PoolData | null;
  lps: LP[];
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
  const { wallet } = useMe();
  const { setVisible } = useWalletModal();
  const [data, setData] = useState<PoolDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pools/${address}`, { cache: "no-store" });
      setData((await res.json()) as PoolDetailResponse);
    } catch {
      setData({ pool: null, lps: [] });
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

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
                {x}-{y}
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

      <div className="mt-6">
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
