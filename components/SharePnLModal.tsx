"use client";

import { useState } from "react";
import type { ApiUser, ApiSnapshot } from "@/lib/api-types";
import { displayName, fmtUsd } from "@/lib/format";
import { Modal } from "@/components/Modal";
import { useMe } from "@/components/MeProvider";

type Range = "7d" | "30d" | "all";

const RANGE_LABEL: Record<Range, string> = { "7d": "7D", "30d": "30D", all: "All-time" };

interface SharePnLModalProps {
  user: ApiUser;
  snap: ApiSnapshot;
  isOpen: boolean;
  onClose: () => void;
}

export function SharePnLModal({ user, snap, isOpen, onClose }: SharePnLModalProps) {
  if (!isOpen) return null;
  return <ShareDialog user={user} snap={snap} onClose={onClose} />;
}

function ShareDialog({ user, snap, onClose }: Omit<SharePnLModalProps, "isOpen">) {
  const { userId } = useMe();
  const [range, setRange] = useState<Range>("30d");
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const mine = userId != null && userId === user.id;
  const name = displayName(user);
  const slug = user.xHandle || String(user.id);

  const pnlMap: Record<Range, number | null> = {
    "7d": snap.pnl7d,
    "30d": snap.pnl30d,
    all: snap.totalPnlUsd,
  };

  const pnl = pnlMap[range] ?? 0;
  const rangeLabel = RANGE_LABEL[range];
  // Same origin as the page (prod, or the local preview), so the card shows this deployment's numbers.
  const origin = window.location.origin;
  const cardUrl = `/api/card/${encodeURIComponent(slug)}?range=${range}`;
  const profileUrl = `${origin}/profile/${encodeURIComponent(slug)}`;

  // Same number format as the profile page's PnL headline.
  const pnlText = fmtUsd(pnl, { signed: true, compact: false });
  const shareText = mine
    ? `My ${rangeLabel} Meteora LP PnL: ${pnlText} 🏖️`
    : `${name}'s ${rangeLabel} Meteora LP PnL: ${pnlText} 🏖️`;
  const xShareUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(profileUrl)}`;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(cardUrl);
      if (!response.ok) throw new Error(`Card request failed (${response.status})`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pool-party-${slug}-${range}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyImage = async () => {
    setCopying(true);
    try {
      const response = await fetch(cardUrl);
      if (!response.ok) throw new Error(`Card request failed (${response.status})`);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setTimeout(() => setCopying(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
      setCopying(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="share-pnl-title" className="max-w-[680px] p-5 sm:p-6" testId="share-modal">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/[.08] text-white/60 hover:bg-white/[.14] hover:text-white"
      >
        ✕
      </button>

      <h2 id="share-pnl-title" className="pr-10 text-2xl font-extrabold">
        {mine ? "Share your PnL" : "Share PnL"}
      </h2>
      {!mine && <p className="mt-1 truncate pr-10 text-[13px] text-mute">{name}&apos;s Meteora LP stats</p>}

      <div className="mb-4 mt-4 flex gap-2">
        {(["7d", "30d", "all"] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
              range === r ? "bg-orange text-white shadow-lg shadow-orange/25" : "bg-white/[.08] text-white/70 hover:bg-white/[.14] hover:text-white"
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="mb-4 aspect-[1200/630] overflow-hidden rounded-2xl border border-white/10 bg-[#110D14]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cardUrl} alt={`${name}'s ${rangeLabel} PnL card`} className="h-full w-full object-cover" data-testid="share-card" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-white/[.08] px-3 text-[13px] font-bold hover:bg-white/[.14] disabled:cursor-not-allowed disabled:text-white/40 sm:text-sm"
        >
          {downloading ? (
            "Saving…"
          ) : (
            <>
              Download<span className="hidden sm:inline">&nbsp;PNG</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleCopyImage}
          disabled={copying}
          className="flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-white/[.08] px-3 text-[13px] font-bold hover:bg-white/[.14] disabled:cursor-default sm:text-sm"
        >
          {copying ? "Copied!" : "Copy image"}
        </button>
        <a
          href={xShareUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-orange px-3 text-[13px] font-bold shadow-lg shadow-orange/30 hover:bg-orange-soft sm:text-sm"
        >
          Share on X
        </a>
      </div>
    </Modal>
  );
}
