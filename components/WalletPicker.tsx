"use client";

import type { WalletName } from "@solana/wallet-adapter-base";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet, type Wallet } from "@solana/wallet-adapter-react";

/** Popular Solana wallets suggested (install links only) when they aren't detected. */
const SUGGESTED: ReadonlyArray<{ name: string; url: string }> = [
  { name: "Phantom", url: "https://phantom.com/download" },
  { name: "Solflare", url: "https://solflare.com/download" },
  { name: "Backpack", url: "https://backpack.app/downloads" },
  { name: "OKX Wallet", url: "https://www.okx.com/web3" },
];

function isDetected(w: Wallet): boolean {
  return w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable;
}

interface WalletPickerProps {
  /** Wallet currently being connected/signed with (shows a spinner label). */
  busyName: WalletName | null;
  onPick: (name: WalletName) => void;
}

/**
 * Lists every wallet the adapter knows about: Wallet Standard wallets are auto-detected by
 * WalletProvider, plus any explicit adapters. Detected wallets first; others shown as "Not detected"
 * with an install link. Never auto-selects a wallet.
 */
export function WalletPicker({ busyName, onPick }: WalletPickerProps) {
  const { wallets, wallet: current, connected } = useWallet();

  const detected = wallets.filter(isDetected);
  const detectedNames = new Set(wallets.map((w) => w.adapter.name.toLowerCase()));
  const notDetected = wallets.filter((w) => !isDetected(w));
  const suggestions = SUGGESTED.filter((s) => !detectedNames.has(s.name.toLowerCase()));

  return (
    <div className="space-y-4" data-testid="wallet-picker">
      {detected.length > 0 ? (
        <ul className="space-y-2">
          {detected.map((w) => {
            const name = w.adapter.name;
            const isCurrent = connected && current?.adapter.name === name;
            const busy = busyName === name;
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => onPick(name)}
                  disabled={busyName !== null}
                  className="flex h-14 w-full items-center gap-3 rounded-2xl border border-border bg-surface-raised px-4 text-left text-[15px] font-semibold text-fg transition hover:border-border-strong hover:bg-border disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.adapter.icon} alt="" className="h-8 w-8 rounded-lg" />
                  <span className="flex-1 truncate">{name}</span>
                  <span className="text-[12px] font-medium text-mute">
                    {busy
                      ? "Check your wallet…"
                      : isCurrent
                        ? "Connected"
                        : w.readyState === WalletReadyState.Installed
                          ? "Detected"
                          : "Available"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-raised px-4 py-5 text-center" data-testid="wallet-picker-empty">
          <p className="text-[15px] font-semibold text-fg">No Solana wallet detected</p>
          <p className="mt-1 text-[13px] text-mute">Install a wallet extension (or open this page in your wallet app), then reload.</p>
        </div>
      )}

      {(notDetected.length > 0 || suggestions.length > 0) && (
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-mute">Not detected</p>
          <ul className="space-y-1.5">
            {notDetected.map((w) => (
              <li key={w.adapter.name}>
                <a
                  href={w.adapter.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] text-mute transition hover:bg-surface-raised hover:text-fg"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.adapter.icon} alt="" className="h-6 w-6 rounded-md opacity-70" />
                  <span className="flex-1">{w.adapter.name}</span>
                  <span className="text-[12px] text-mute">Install ↗</span>
                </a>
              </li>
            ))}
            {suggestions
              .filter((s) => !notDetected.some((w) => w.adapter.name.toLowerCase() === s.name.toLowerCase()))
              .map((s) => (
                <li key={s.name}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] text-mute transition hover:bg-surface-raised hover:text-fg"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-border text-[12px] font-bold text-fg-secondary">
                      {s.name.charAt(0)}
                    </span>
                    <span className="flex-1">{s.name}</span>
                    <span className="text-[12px] text-mute">Install ↗</span>
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
