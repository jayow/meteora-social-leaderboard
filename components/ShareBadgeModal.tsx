"use client";

import { useState } from "react";
import { Modal, ModalClose } from "@/components/Modal";
import { BADGES, tierLabel, type ApiBadge } from "@/lib/badges/config";

/**
 * Share one of your badges: a square card (download / copy / post). The X post links to the badge's
 * page, whose link preview is the wide version of the same card.
 */
export function ShareBadgeModal({ badge, slug, onClose }: { badge: ApiBadge; slug: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const def = BADGES[badge.id];
  const tier = def.tiered ? tierLabel(badge.id, badge.tier)?.split(" · ")[0] ?? null : null;
  const fullName = `${tier ? `${tier} ` : ""}${def.name}`;
  const cardUrl = `/api/card/${encodeURIComponent(slug)}/badge/${badge.id}`;
  const pageUrl = `${window.location.origin}/badges/${encodeURIComponent(slug)}/${badge.id}`;
  const xShareUrl = `https://x.com/intent/post?text=${encodeURIComponent(`Earned the ${fullName} badge on Pool Party`)}&url=${encodeURIComponent(pageUrl)}`;

  const fetchCard = async (): Promise<Blob> => {
    const res = await fetch(cardUrl);
    if (!res.ok) throw new Error(String(res.status));
    return res.blob();
  };

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const url = URL.createObjectURL(await fetchCard());
      const a = document.createElement("a");
      a.href = url;
      a.download = `pool-party-${badge.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't download the card. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const copy = async () => {
    setCopying(true);
    setError(null);
    try {
      const blob = await fetchCard();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setTimeout(() => setCopying(false), 2000);
    } catch {
      setError("Couldn't copy the image here. Use Download instead.");
      setCopying(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="share-badge-title" className="max-w-[460px] p-5 sm:p-6" testId="share-badge-modal">
      <ModalClose onClick={onClose} className="absolute right-3 top-3 sm:right-4 sm:top-4" />
      <h2 id="share-badge-title" className="pr-10 text-xl font-semibold tracking-tight">
        Share {fullName}
      </h2>

      <div className="relative mt-4 aspect-square overflow-hidden rounded-tile border border-border bg-bg" aria-busy={!loaded || undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cardUrl}
          alt={`${fullName} badge card`}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
          data-testid="share-badge-card"
        />
        {!loaded && <div className="skeleton absolute inset-0 rounded-none" aria-hidden="true" />}
      </div>

      {error && <p className="mt-3 text-sm text-dn">{error}</p>}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => void download()} disabled={downloading} className="btn-secondary h-11 px-3">
          {downloading ? "Saving…" : "Download"}
        </button>
        <button type="button" onClick={() => void copy()} disabled={copying} className="btn-secondary h-11 px-3">
          {copying ? "Copied" : "Copy image"}
        </button>
        <a href={xShareUrl} target="_blank" rel="noreferrer" className="btn-primary h-11 px-3">
          Share on X
        </a>
      </div>
    </Modal>
  );
}
