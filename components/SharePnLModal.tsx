"use client";

import { useState, useEffect } from "react";
import type { ApiUser, ApiSnapshot } from "@/lib/api-types";
import { fmtUsd } from "@/lib/format";

const APP_URL = "https://web-production-c8f29.up.railway.app";

type Range = "7d" | "30d" | "all";

interface SharePnLModalProps {
  user: ApiUser;
  snap: ApiSnapshot;
  isOpen: boolean;
  onClose: () => void;
}

export function SharePnLModal({ user, snap, isOpen, onClose }: SharePnLModalProps) {
  const [range, setRange] = useState<Range>("30d");
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const pnlMap: Record<Range, number | null> = {
    "7d": snap.pnl7d,
    "30d": snap.pnl30d,
    all: snap.totalPnlUsd,
  };

  const pnl = pnlMap[range] ?? 0;
  const rangeLabel = range === "7d" ? "7D" : range === "30d" ? "30D" : "All-time";
  const cardUrl = `${APP_URL}/api/card/${user.xHandle || user.id}?range=${range}`;
  const profileUrl = `${APP_URL}/profile/${user.xHandle || user.id}`;

  const shareText = `My ${rangeLabel} Meteora LP PnL: ${fmtUsd(pnl, { signed: true })} 🏖️`;
  const xShareUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(profileUrl)}`;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await fetch(cardUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pool-party-${user.xHandle || user.id}-${range}.png`;
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
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      setTimeout(() => setCopying(false), 2000);
    } catch (error) {
      console.error("Copy failed:", error);
      setCopying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[680px] rounded-3xl bg-[#12121C] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
        >
          ✕
        </button>

        <h2 className="mb-4 text-2xl font-extrabold">Share PnL</h2>

        <div className="mb-4 flex gap-2">
          {(["7d", "30d", "all"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                range === r
                  ? "bg-orange text-white shadow-lg shadow-orange/25"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              }`}
            >
              {r === "7d" ? "7D" : r === "30d" ? "30D" : "All-time"}
            </button>
          ))}
        </div>

        <div className="mb-4 overflow-hidden rounded-2xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cardUrl} alt="PnL Card Preview" className="w-full" />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-bold hover:bg-white/20 disabled:opacity-60"
          >
            {downloading ? "Downloading…" : "Download PNG"}
          </button>
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={copying}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-bold hover:bg-white/20 disabled:opacity-60"
          >
            {copying ? "Copied!" : "Copy image"}
          </button>
          <a
            href={xShareUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-orange text-sm font-bold shadow-lg shadow-orange/30 hover:bg-orange-soft"
          >
            Share on X
          </a>
        </div>
      </div>
    </div>
  );
}
