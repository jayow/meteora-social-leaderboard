"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import { Logo, XIcon, Avatar } from "@/components/ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { SignInModal, type SignInStep } from "@/components/SignInModal";
import { useMe } from "@/components/MeProvider";
import { meteoraHomeUrl } from "@/lib/meteora-links";
import { forgetRememberedWallet } from "@/lib/wallet-session";
import { displayName } from "@/lib/format";
import { OwnWalletRow } from "@/components/OwnWalletRow";
import { onSessionChanged, onSignInRequested } from "@/lib/session-events";

interface SessionData {
  userId?: number | null;
  xHandle?: string | null;
  xName?: string | null;
  xAvatarUrl?: string | null;
  /** Generated beach/pool display name, shown when there's no X handle. */
  anonName?: string | null;
  /** Dense beta member number; null until an invite is redeemed. */
  memberNumber?: number | null;
  /** Owner's full primary wallet (private session endpoint only). */
  wallet?: string | null;
  /** Truncated addresses of all the owner's wallets. */
  wallets?: string[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useMe();
  const [session, setSession] = useState<SessionData | null>(null);
  const { disconnect, publicKey, connected } = useWallet();
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInStep, setSignInStep] = useState<SignInStep>("methods");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const onBoard = pathname === "/";
  const onMe = pathname.startsWith("/profile");
  const onPools = pathname.startsWith("/pools");
  const onFeed = pathname === "/feed" || pathname.startsWith("/feed/");
  const onInvites = pathname === "/invites";
  // The session knows the member number even for X-only accounts with no connected wallet.
  const isMember = Boolean(session?.memberNumber || user?.memberNumber);
  const isSignedIn = Boolean(session?.userId);
  const hasWallet = Boolean(session?.wallets && session.wallets.length > 0);
  const hasX = Boolean(session?.xHandle);
  // Private, owner-only: the connected adapter key when it belongs to this account, else the
  // primary wallet from the session endpoint. Never sourced from public APIs.
  const adapterWallet = connected && publicKey ? publicKey.toBase58() : null;
  const adapterShort = adapterWallet ? `${adapterWallet.slice(0, 4)}…${adapterWallet.slice(-4)}` : null;
  const ownWallet =
    adapterWallet && adapterShort && session?.wallets?.includes(adapterShort) ? adapterWallet : session?.wallet ?? null;

  const loadSession = useCallback(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json() as Promise<SessionData>)
      .then((d) => setSession(d))
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    loadSession();
    return onSessionChanged(loadSession);
  }, [loadSession]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  // Signed-out actions (e.g. Follow) ask for the Sign in modal instead of redirecting away.
  useEffect(
    () =>
      onSignInRequested(() => {
        setSignInStep("methods");
        setSignInOpen(true);
      }),
    []
  );

  const openSignIn = (step: SignInStep) => {
    setSignInStep(step);
    setSignInOpen(true);
  };

  // Disconnect the adapter and forget the remembered wallet so the picker shows again next time.
  const resetWallet = async () => {
    await disconnect().catch(() => undefined);
    forgetRememberedWallet();
  };

  const handleSignOut = async () => {
    await resetWallet();
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto flex h-[64px] max-w-[1320px] items-center gap-6 px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
          </Link>
          {(
            <nav className="mx-auto hidden items-center gap-1 rounded-full border border-border bg-surface-raised p-1 text-[14px] font-semibold lg:flex">
              <Link href="/" className={`rounded-full px-4 py-1.5 ${onBoard ? "bg-border text-fg" : "text-mute hover:text-fg"}`}>
                Leaderboard
              </Link>
              <Link href="/pools" className={`rounded-full px-4 py-1.5 ${onPools ? "bg-border text-fg" : "text-mute hover:text-fg"}`}>
                Pools
              </Link>
              <Link href="/feed" aria-current={onFeed ? "page" : undefined} className={`rounded-full px-4 py-1.5 ${onFeed ? "bg-border text-fg" : "text-mute hover:text-fg"}`}>
                Activity
              </Link>
              {isSignedIn && (
                <Link href="/profile/me" className={`rounded-full px-4 py-1.5 ${onMe ? "bg-border text-fg" : "text-mute hover:text-fg"}`}>
                  Profile
                </Link>
              )}
              {isMember && (
                <Link href="/invites" className={`rounded-full px-4 py-1.5 ${onInvites ? "bg-border text-fg" : "text-mute hover:text-fg"}`}>
                  Invites
                </Link>
              )}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {/* One entry: signed out -> Sign in (wallet picker or X); signed in, not joined -> Join beta; members -> account menu only. */}
            {!isSignedIn && (
              <button
                type="button"
                onClick={() => openSignIn("methods")}
                className="btn-primary h-9 px-4 text-[13px]"
                data-testid="header-entry"
              >
                Sign in
              </button>
            )}
            {isSignedIn && !isMember && (
              <Link href="/join" className="btn-primary h-9 px-4 text-[13px]" data-testid="header-entry">
                Join beta
              </Link>
            )}

            {isSignedIn && (
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex h-9 items-center gap-2 rounded-full border border-border bg-surface-raised pl-1.5 pr-3 text-[13px] font-semibold transition hover:bg-border"
                >
                  <Avatar 
                    user={{ id: session?.userId || undefined, xAvatarUrl: session?.xAvatarUrl }} 
                    size={26} 
                  />
                  <span className="num">
                    {displayName({ xHandle: session?.xHandle, anonName: session?.anonName })}
                  </span>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-border bg-surface p-1 text-[14px] shadow-xl shadow-black/40">
                    {!hasX && (
                      <a
                        href={`/api/x/login?link=true&returnTo=${encodeURIComponent("/profile/me")}`}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-surface-raised"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        Link X account
                      </a>
                    )}
                    {isSignedIn && <OwnWalletRow address={hasWallet ? ownWallet : null} />}
                    <hr className="my-1 border-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        handleSignOut();
                      }}
                      className="block w-full rounded-xl px-3 py-2 text-left text-dn hover:bg-surface-raised"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {children}

      {/* Outbound Meteora link (referral) lives here rather than in the main nav. */}
      <footer className="mx-auto flex max-w-[1320px] justify-center px-4 pb-6 pt-4 text-[12px] text-mute lg:justify-end lg:px-6">
        <a href={meteoraHomeUrl()} target="_blank" rel="noreferrer" className="hover:text-fg">
          Meteora ↗
        </a>
      </footer>

      {/* Mobile bottom tab bar */}
      {(
        <nav className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
          <div className="flex items-center justify-around rounded-[26px] border border-border bg-surface px-2 py-2 shadow-2xl shadow-black/60">
            <Link href="/" className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onBoard ? "text-accent" : "text-mute"}`}>
              <span className="text-[20px]">🏆</span>Ranks
            </Link>
            <Link href="/pools" className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onPools ? "text-accent" : "text-mute"}`}>
              <span className="text-[20px]">🏊</span>Pools
            </Link>
            <Link href="/feed" aria-current={onFeed ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onFeed ? "text-accent" : "text-mute"}`}>
              <span className="text-[20px]">🌊</span>Activity
            </Link>
            {isMember && (
              <Link href="/invites" className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onInvites ? "text-accent" : "text-mute"}`}>
                <span className="text-[20px]">🎟️</span>Invites
              </Link>
            )}
            {isSignedIn && (
              <Link href="/profile/me" className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onMe ? "text-accent" : "text-mute"}`}>
                <span className="text-[20px]">👤</span>Me
              </Link>
            )}
          </div>
        </nav>
      )}

      <SignInModal open={signInOpen} initialStep={signInStep} onClose={closeSignIn} />
    </div>
  );
}
