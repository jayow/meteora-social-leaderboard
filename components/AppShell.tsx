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

  const handleChangeWallet = async () => {
    await resetWallet();
    openSignIn("wallets");
  };

  const handleSignOut = async () => {
    await resetWallet();
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/[.06] bg-[#12121C]">
        <div className="mx-auto flex h-[64px] max-w-[1320px] items-center gap-6 px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="hidden rounded-full border border-orange/30 bg-orange/10 px-2 py-0.5 text-[11px] font-semibold text-orange sm:inline">Party starts here</span>
          </Link>
          {isMember ? (
            <nav className="mx-auto hidden items-center gap-1 rounded-full border border-white/[.06] bg-white/[.03] p-1 text-[14px] font-semibold lg:flex">
              <Link href="/" className={`rounded-full px-4 py-1.5 ${onBoard ? "bg-white/[.1] text-white" : "text-mute hover:text-white"}`}>
                Leaderboard
              </Link>
              <Link href="/pools" className={`rounded-full px-4 py-1.5 ${onPools ? "bg-white/[.1] text-white" : "text-mute hover:text-white"}`}>
                Pools
              </Link>
              <Link href="/feed" aria-current={onFeed ? "page" : undefined} className={`rounded-full px-4 py-1.5 ${onFeed ? "bg-white/[.1] text-white" : "text-mute hover:text-white"}`}>
                Activity
              </Link>
              <Link href="/profile/me" className={`rounded-full px-4 py-1.5 ${onMe ? "bg-white/[.1] text-white" : "text-mute hover:text-white"}`}>
                Profile
              </Link>
              <Link href="/invites" className={`rounded-full px-4 py-1.5 ${onInvites ? "bg-white/[.1] text-white" : "text-mute hover:text-white"}`}>
                Invites
              </Link>
              <a href={meteoraHomeUrl()} target="_blank" rel="noreferrer" className="rounded-full px-4 py-1.5 text-mute hover:text-white">
                Meteora ↗
              </a>
            </nav>
          ) : (
            <div className="mx-auto">
              <Link href="/join" className="brand-grad rounded-full px-6 py-2 text-[14px] font-semibold">
                Join Beta
              </Link>
            </div>
          )}
          
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {!isSignedIn && (
              <button
                type="button"
                onClick={() => openSignIn("methods")}
                className="h-9 rounded-full bg-orange px-4 text-[13px] font-bold text-white shadow-lg shadow-orange/25 transition hover:bg-orange-soft"
              >
                Sign in
              </button>
            )}

            {isSignedIn && (
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[.04] pl-1.5 pr-3 text-[13px] font-semibold transition hover:bg-white/[.08]"
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
                  <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#1A1623] p-1 text-[14px] shadow-xl">
                    <Link
                      href="/profile/me"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-xl px-3 py-2 hover:bg-white/[.06]"
                    >
                      Profile
                    </Link>
                    {!hasX && (
                      <a
                        href={`/api/x/login?link=true&returnTo=${encodeURIComponent("/profile/me")}`}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/[.06]"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        Link X account
                      </a>
                    )}
                    {isSignedIn && <OwnWalletRow address={hasWallet ? ownWallet : null} />}
                    {hasWallet && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          void handleChangeWallet();
                        }}
                        className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/[.06]"
                      >
                        Change wallet
                      </button>
                    )}
                    {!hasWallet && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          // TODO: implement wallet linking flow
                          alert("Wallet linking coming soon");
                        }}
                        className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/[.06]"
                      >
                        Link wallet
                      </button>
                    )}
                    <hr className="my-1 border-white/10" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        handleSignOut();
                      }}
                      className="block w-full rounded-xl px-3 py-2 text-left text-dn hover:bg-white/[.06]"
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

      {/* Mobile bottom tab bar */}
      {isMember && (
        <nav className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
          <div className="flex items-center justify-around rounded-[26px] border border-white/[.08] bg-[#15131f] px-2 py-2 shadow-2xl shadow-black/60">
            <Link href="/" className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onBoard ? "text-orange" : "text-mute"}`}>
              <span className="text-[20px]">🏆</span>Ranks
            </Link>
            <Link href="/pools" className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onPools ? "text-orange" : "text-mute"}`}>
              <span className="text-[20px]">🏊</span>Pools
            </Link>
            <Link href="/invites" className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onInvites ? "text-orange" : "text-mute"}`}>
              <span className="text-[20px]">🎟️</span>Invites
            </Link>
            {isSignedIn ? (
              <Link href="/profile/me" className="brand-grad -mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-base text-[26px] font-bold shadow-lg shadow-orange/30" aria-label="My rank">
                +
              </Link>
            ) : (
              <button type="button" onClick={() => openSignIn("methods")} className="brand-grad -mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-base text-[26px] font-bold shadow-lg shadow-orange/30" aria-label="Sign in">
                +
              </button>
            )}
            <Link href="/feed" aria-current={onFeed ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onFeed ? "text-orange" : "text-mute"}`}>
              <span className="text-[20px]">🌊</span>Activity
            </Link>
            <Link href="/profile/me" className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold ${onMe ? "text-orange" : "text-mute"}`}>
              <span className="text-[20px]">👤</span>Me
            </Link>
          </div>
        </nav>
      )}

      <SignInModal open={signInOpen} initialStep={signInStep} onClose={closeSignIn} />
    </div>
  );
}
