"use client";

import { useEffect, useRef, useState } from "react";

function shortWallet(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * The signed-in owner's own wallet, shown privately in the header menu. `address` must come from the
 * private session endpoint or the connected wallet adapter, never from a public API.
 */
export function OwnWalletRow({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!address) {
    return <div className="px-3 py-2 text-sm text-mute">No wallet connected</div>;
  }

  const onCopy = async () => {
    if (!(await copyText(address))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1 pl-3 pr-1.5 text-sm text-mute" data-testid="own-wallet">
      <span className="num truncate" title="Your wallet (only visible to you)">
        {shortWallet(address)}
      </span>
      <button
        type="button"
        onClick={() => void onCopy()}
        aria-label="Copy wallet address"
        title="Copy wallet address"
        className="flex h-7 shrink-0 items-center gap-1 rounded-tag px-2 text-mute transition hover:bg-surface-raised hover:text-fg"
      >
        {copied ? (
          <span className="text-sm text-fg-secondary" aria-live="polite">Copied</span>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
    </div>
  );
}
