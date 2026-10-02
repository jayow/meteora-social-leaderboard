"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Pills } from "@/components/ui";
import { OpenPositions } from "@/components/OpenPositions";
import { fmtPct, fmtUsd, shortAddr } from "@/lib/format";
import type { WalletLookup } from "@/lib/wallet-lookup";

type Range = "1d" | "7d" | "30d" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "all", label: "All" },
];

/**
 * Any wallet's Meteora LP stats and open positions (from the header search). Live data only, and it
 * never shows or links to a Pool Party account: who owns a wallet stays private.
 */
export default function WalletPage() {
  const { address } = useParams<{ address: string }>();
  const [data, setData] = useState<WalletLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("30d");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/wallets/lookup/${encodeURIComponent(address)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as WalletLookup & { error?: string };
        if (cancelled) return;
        if (!r.ok) setError(j.error || "Couldn't load this wallet");
        else setData(j);
      })
      .catch(() => !cancelled && setError("Couldn't load this wallet"));
    return () => {
      cancelled = true;
    };
  }, [address]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const s = data?.stats[range];
  const pnl = range === "all" ? data?.totalPnlUsd ?? s?.pnlUsd ?? null : s?.pnlUsd ?? null;

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 lg:px-6" data-testid="wallet-page">
      <div className="mb-8">
        <div className="text-sm text-mute">Wallet</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="num text-xl font-semibold tracking-tight" title={address}>
            {shortAddr(address)}
          </h1>
          <button type="button" onClick={() => void copy()} className="btn-ghost h-8 px-2 text-sm">
            {copied ? "Copied" : "Copy address"}
          </button>
        </div>
        <p className="mt-1 text-sm text-mute">Live Meteora DLMM data for this address. Pool Party never shows who owns a wallet.</p>
      </div>

      {error ? (
        <p className="text-base text-mute">{error}</p>
      ) : !data ? (
        <p className="text-base text-mute">Loading this wallet from Meteora…</p>
      ) : (
        <div className="space-y-12">
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Portfolio</h2>
              <Pills value={range} onChange={setRange} options={RANGES} />
            </div>
            <div className={`num text-3xl font-bold tracking-tight ${(pnl ?? 0) >= 0 ? "text-up" : "text-dn"}`}>{fmtUsd(pnl, { signed: true, compact: false })}</div>
            <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
              <Figure label="Total value" value={fmtUsd(data.openValueUsd)} sub="in open positions" />
              <Figure label="Win rate" value={fmtPct(s?.winRate ?? null, 1)} />
              <Figure label="Volume" value={fmtUsd(s?.volumeUsd ?? null)} sub="deposited" />
              <Figure label="Fees earned" value={fmtUsd(s?.feesUsd ?? null)} tone="up" />
              <Figure label="Closed positions" value={data.positionsClosed != null ? String(data.positionsClosed) : "—"} sub="all time" />
            </dl>
          </section>
          <OpenPositions sourceUrl={`/api/wallets/lookup/${encodeURIComponent(address)}/open-positions`} showIdeas={false} />
        </div>
      )}
    </main>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-sm text-mute">{label}</dt>
      <dd className={`num mt-0.5 text-lg font-semibold ${tone === "up" ? "text-up" : "text-fg"}`}>{value}</dd>
      {sub && <dd className="truncate text-xs text-mute">{sub}</dd>}
    </div>
  );
}
