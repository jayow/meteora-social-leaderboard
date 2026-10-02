"use client";

import { useState } from "react";
import type { ApiUser, ApiSnapshot } from "@/lib/api-types";
import { displayName, fmtUsd } from "@/lib/format";
import { Modal, ModalClose } from "@/components/Modal";
import { useMe } from "@/components/MeProvider";

type Range = "7d" | "30d" | "all";

const RANGE_LABEL: Record<Range, string> = { "7d": "7D", "30d": "30D", all: "All-time" };

/** What can go on the card besides the PnL (the route's `show` param). Defaults match the route's. */
const PARTS = [
  { value: "name", label: "Name and photo" },
  { value: "pool", label: "Top pool" },
  { value: "winrate", label: "Win rate" },
  { value: "fees", label: "Fees" },
  { value: "volume", label: "Volume" },
  { value: "rank", label: "Leaderboard rank" },
  { value: "shape", label: "Pool shape backdrop" },
] as const;
type Part = (typeof PARTS)[number]["value"];
const DEFAULT_PARTS: Part[] = ["name", "winrate", "fees", "rank", "pool", "shape"];

interface SharePnLModalProps {
  user: ApiUser;
  snap: ApiSnapshot;
  isOpen: boolean;
  /** The range the page is showing, so the shared number matches what's on screen. */
  initialRange?: Range;
  onClose: () => void;
}

export function SharePnLModal({ user, snap, isOpen, initialRange, onClose }: SharePnLModalProps) {
  if (!isOpen) return null;
  return <ShareDialog user={user} snap={snap} initialRange={initialRange} onClose={onClose} />;
}

function ShareDialog({ user, snap, initialRange = "30d", onClose }: Omit<SharePnLModalProps, "isOpen">) {
  const { userId } = useMe();
  const [range, setRange] = useState<Range>(initialRange);
  const [copying, setCopying] = useState(false);
  const [parts, setParts] = useState<Part[]>(DEFAULT_PARTS);
  // The card renders on the server; show a placeholder until each new version has loaded.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
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
  const show = PARTS.map((p) => p.value).filter((v) => parts.includes(v)).join(",");
  const cardUrl = `/api/card/${encodeURIComponent(slug)}?range=${range}&show=${show}`;
  const cardLoading = loadedUrl !== cardUrl;
  const togglePart = (v: Part) => setParts((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
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
      <ModalClose onClick={onClose} className="absolute right-3 top-3 sm:right-4 sm:top-4" />

      <h2 id="share-pnl-title" className="pr-10 text-xl font-semibold tracking-tight">
        {mine ? "Share your PnL" : "Share PnL"}
      </h2>
      {!mine && <p className="mt-1 truncate pr-10 text-base text-mute">{name}&apos;s Meteora LP stats</p>}

      <div className="seg mb-4 mt-4" role="group" aria-label="Range">
        {(["7d", "30d", "all"] as Range[]).map((r) => (
          <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r} className="seg-item">
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="relative mb-4 aspect-[1200/630] overflow-hidden rounded-tile border border-border bg-bg" aria-busy={cardLoading || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cardUrl}
          alt={`${name}'s ${rangeLabel} PnL card`}
          onLoad={() => setLoadedUrl(cardUrl)}
          onError={() => setLoadedUrl(cardUrl)}
          className={`h-full w-full object-cover transition-opacity ${cardLoading ? "opacity-0" : "opacity-100"}`}
          data-testid="share-card"
        />
        {cardLoading && <div className="skeleton absolute inset-0 rounded-none" aria-hidden="true" />}
      </div>

      {/* What to include; the PnL is always on the card. */}
      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-medium text-mute">Show on the card</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3" data-testid="share-options">
          {PARTS.map((p) => (
            <label key={p.value} className="flex cursor-pointer items-center gap-2 text-base text-fg-secondary">
              <input
                type="checkbox"
                checked={parts.includes(p.value)}
                onChange={() => togglePart(p.value)}
                className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="btn-secondary h-11 px-3"
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
          className="btn-secondary h-11 px-3"
        >
          {copying ? "Copied" : "Copy image"}
        </button>
        <a
          href={xShareUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-primary h-11 px-3"
        >
          Share on X
        </a>
      </div>
    </Modal>
  );
}
