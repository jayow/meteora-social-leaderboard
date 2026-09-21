"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Trader } from "@/lib/types";
import { bootstrap, getTrader } from "@/lib/storage";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { PnLCalendar } from "@/components/PnLCalendar";
import { ThesisEditor } from "@/components/ThesisEditor";
import { XConnect } from "@/components/XConnect";
import { WalletButton } from "@/components/WalletButton";

export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const mine = id === "me";
  const [trader, setTrader] = useState<Trader | null>(null);

  const reload = () => {
    bootstrap();
    setTrader(getTrader(id));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!trader) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Leaderboard</Link>
        <p className="mt-6 text-zinc-500">Trader not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">← Leaderboard</Link>
        <div className="flex items-center gap-3">
          {mine && <span className="rounded-full border border-violet-500/40 px-3 py-1 text-xs text-violet-300">Your profile</span>}
          {mine && <WalletButton />}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={trader.xAvatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${trader.username}`} alt="" className="h-16 w-16 rounded-full border border-zinc-700" />
        <div>
          <h1 className="text-2xl font-semibold">{trader.displayName}</h1>
          <p className="text-sm text-zinc-500">@{trader.username}</p>
          <div className="mt-3">
            <XConnect handle={trader.xHandle} avatarUrl={trader.xAvatarUrl} editable={mine} onChange={reload} />
          </div>
        </div>
      </div>

      <div className="mb-6">
        <ThesisEditor initial={trader.thesis} editable={mine} onSaved={() => reload()} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <PortfolioSummary trader={trader} />
        <PnLCalendar history={trader.pnlHistory} walletAddress={trader.walletAddress} />
      </div>
    </main>
  );
}
