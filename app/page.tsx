"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Trader } from "@/lib/types";
import { bootstrap, listTraders } from "@/lib/storage";
import { LeaderboardCard } from "@/components/LeaderboardCard";

export default function HomePage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  useEffect(() => {
    bootstrap();
    setTraders(listTraders());
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-400">Meteora Social</p>
          <h1 className="mt-1 text-3xl font-semibold">Leaderboard</h1>
          <p className="mt-2 text-sm text-zinc-400">Thesis · X identity · PnL calendar</p>
        </div>
        <Link href="/profile/me" className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500">My Profile</Link>
      </header>
      <div className="space-y-3">
        {traders.map((t, i) => (
          <LeaderboardCard key={t.id} trader={t} rank={i + 1} />
        ))}
        {!traders.length && <p className="text-sm text-zinc-500">Loading traders…</p>}
      </div>
    </main>
  );
}
