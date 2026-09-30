"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMe } from "@/components/MeProvider";
import { fmtUsd } from "@/lib/format";
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
  friendsCount: number;
  friendAvatars: string[];
  friendHandles: string[];
}

interface PoolsResponse {
  pools: PoolData[];
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

export default function PoolsPage() {
  const { wallet } = useMe();
  const { setVisible } = useWalletModal();
  const [data, setData] = useState<PoolsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pools", { cache: "no-store" });
      setData((await res.json()) as PoolsResponse);
    } catch {
      setData({ pools: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pools = data?.pools ?? [];

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
            <span className="brand-text">Pools</span> 🏊
          </h1>
          <p className="mt-1 text-[14px] text-mute">
            All DLMM pools with active LPs · see where your friends are providing liquidity
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 sm:flex-nowrap">
          <div className="flex-1">
            <div className="text-[12px] text-mute">Active pools</div>
            <div className="num text-[22px] font-bold">{pools.length}</div>
          </div>
        </div>
      </div>

      {!wallet && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange/25 bg-gradient-to-r from-orange/15 via-pink/10 to-purp/15 px-4 py-3">
          <div className="text-[14px]">
            <span className="font-bold">Connect to see where your friends LP</span>{" "}
            <span className="text-white/70">Follow friends and discover pools they trust.</span>
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

      {loading && !data ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="glass h-20 animate-pulse rounded-[20px]" />
          ))}
        </div>
      ) : pools.length === 0 ? (
        <div className="glass mt-6 rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">🏊</div>
          <h2 className="mt-2 text-[22px] font-extrabold">No pools yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-mute">
            Pools will appear here as LPs sync their positions.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {pools.map((p) => (
            <PoolRow key={p.poolAddress} pool={p} hasWallet={Boolean(wallet)} />
          ))}
        </div>
      )}
    </main>
  );
}

function PoolRow({ pool, hasWallet }: { pool: PoolData; hasWallet: boolean }) {
  const [x = "?", y = "?"] = [pool.tokenX, pool.tokenY];
  const friendsText =
    pool.friendsCount > 0
      ? `${pool.friendsCount} ${pool.friendsCount === 1 ? "friend" : "friends"} here`
      : null;

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
            {x}-{y}
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
          {hasWallet && friendsText && (
            <>
              <span>·</span>
              <span className="font-semibold text-orange">{friendsText}</span>
            </>
          )}
        </div>
      </div>

      {hasWallet && pool.friendsCount > 0 && pool.friendAvatars.length > 0 && (
        <div className="relative z-10 flex -space-x-2">
          {pool.friendAvatars.slice(0, 3).map((avatar, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={avatar.replace("_normal", "_400x400")}
              alt=""
              className="h-8 w-8 rounded-full border-2 border-base bg-[#1d1a2a] object-cover"
              loading="lazy"
            />
          ))}
          {pool.friendsCount > 3 && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-base bg-purp/40 text-[10px] font-bold">
              +{pool.friendsCount - 3}
            </div>
          )}
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
