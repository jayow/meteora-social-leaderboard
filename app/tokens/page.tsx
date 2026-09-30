"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fmtUsd } from "@/lib/format";

interface TokenData {
  tokenMint: string;
  tokenSymbol: string;
  tokenIcon: string | null;
  poolCount: number;
  memberLiquidity: number | null;
  lpCount: number;
  commentCount: number;
}

interface TokensResponse {
  tokens: TokenData[];
}

export default function TokensPage() {
  const [data, setData] = useState<TokensResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tokens", { cache: "no-store" });
      setData((await res.json()) as TokensResponse);
    } catch {
      setData({ tokens: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tokens = data?.tokens ?? [];

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-extrabold leading-tight tracking-tight sm:text-[40px]">
            <span className="brand-text">Tokens</span> 💎
          </h1>
          <p className="mt-1 text-[14px] text-mute">
            Base tokens in Meteora DLMM pools · share your thesis with other holders
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 sm:flex-nowrap">
          <div className="flex-1">
            <div className="text-[12px] text-mute">Tokens</div>
            <div className="num text-[22px] font-bold">{tokens.length}</div>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="glass h-20 animate-pulse rounded-[20px]" />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="glass mt-6 rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">💎</div>
          <h2 className="mt-2 text-[22px] font-extrabold">No tokens yet</h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-mute">
            Tokens will appear here as LPs sync their positions.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {tokens.map((t) => (
            <TokenRow key={t.tokenMint} token={t} />
          ))}
        </div>
      )}
    </main>
  );
}

function TokenRow({ token }: { token: TokenData }) {
  return (
    <Link
      href={`/tokens/${token.tokenMint}`}
      className="glass flex items-center gap-3 rounded-[20px] px-3 py-3 transition hover:bg-white/[.06] sm:px-4"
    >
      <div className="flex">
        {token.tokenIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.tokenIcon}
            alt={token.tokenSymbol}
            className="h-12 w-12 rounded-full border-2 border-base bg-[#222] object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-base bg-purp/40 text-[18px] font-bold">
            {token.tokenSymbol.slice(0, 1)}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[18px] font-bold">
          <span className="truncate">{token.tokenSymbol}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-mute">
          <span>{token.poolCount} pools</span>
          {token.memberLiquidity && token.memberLiquidity > 0 ? (
            <>
              <span>·</span>
              <span>{fmtUsd(token.memberLiquidity)} member liquidity</span>
            </>
          ) : null}
          {token.lpCount > 0 && (
            <>
              <span>·</span>
              <span>
                {token.lpCount} LP{token.lpCount === 1 ? "" : "s"}
              </span>
            </>
          )}
          {token.commentCount > 0 && (
            <>
              <span>·</span>
              <span className="font-semibold text-orange">
                {token.commentCount} {token.commentCount === 1 ? "thesis" : "theses"}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="text-[24px]">→</div>
    </Link>
  );
}
