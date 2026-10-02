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
import { TermsConsentModal } from "@/components/TermsConsentModal";
import { TERMS_VERSION } from "@/lib/legal";

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
  termsVersionAccepted?: string | null;
}

const MENU_BASE = "flex w-full items-center gap-2 rounded-tag px-3 py-2 text-left text-base transition hover:bg-surface-raised";
const MENU_ITEM = `${MENU_BASE} text-fg-secondary hover:text-fg`;

/** Header nav: plain text; the current page is `fg` with a 2px accent bar sitting on the header's hairline. */
function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center text-base font-medium transition ${
        active ? "text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent" : "text-mute hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}

function TabLink({ href, active, label, icon }: { href: string; active: boolean; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-tile py-1 text-xs font-medium transition ${active ? "text-accent" : "text-mute hover:text-fg"}`}
    >
      {icon}
      {label}
    </Link>
  );
}

/* Bottom bar icons: one 20px line set (1.75 stroke), so the bar reads as one family. */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IconWaves = () => (
  <Icon>
    <path d="M2 8c2 0 2-1.5 4-1.5S8 8 10 8s2-1.5 4-1.5S16 8 18 8s2-1.5 4-1.5" />
    <path d="M2 13c2 0 2-1.5 4-1.5S8 13 10 13s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
    <path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
  </Icon>
);
const IconPool = () => (
  <Icon>
    <path d="M8 16V5a2 2 0 0 1 4 0" />
    <path d="M16 16V5a2 2 0 0 1 4 0" />
    <path d="M8 9h8M8 13h8" />
    <path d="M2 20c2 0 2-1.5 4-1.5S8 20 10 20s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
  </Icon>
);
const IconTrophy = () => (
  <Icon>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
    <path d="M16 6h3v1a3 3 0 0 1-3 3M8 6H5v1a3 3 0 0 0 3 3" />
    <path d="M12 13v4M9 20h6M10 17h4" />
  </Icon>
);
const IconTicket = () => (
  <Icon>
    <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path d="M14 6v12" strokeDasharray="2 2.5" />
  </Icon>
);
const IconUser = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

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
  const onPools = pathname === "/pools" || pathname.startsWith("/pools/");
  const onFeed = pathname === "/poolside" || pathname.startsWith("/poolside/");
  const onInvites = pathname === "/invites";
  // The session knows the member number even for X-only accounts with no connected wallet.
  const isMember = Boolean(session?.memberNumber || user?.memberNumber);
  const isSignedIn = Boolean(session?.userId);
  const needsTermsConsent = isSignedIn && session?.termsVersionAccepted !== TERMS_VERSION;
  const hasWallet = Boolean(session?.wallets && session.wallets.length > 0);
  const hasX = Boolean(session?.xHandle);
  // Private, owner-only: the connected adapter key when it belongs to this account, else the
  // primary wallet from the session endpoint. Never sourced from public APIs.
  const adapterWallet = connected && publicKey ? publicKey.toBase58() : null;
  const adapterShort = adapterWallet ? `${adapterWallet.slice(0, 4)}…${adapterWallet.slice(-4)}` : null;
  const ownWallet =
    adapterWallet && adapterShort && session?.wallets?.includes(adapterShort) ? adapterWallet : session?.wallet ?? null;
  const accountName = displayName({ xHandle: session?.xHandle, anonName: session?.anonName });

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
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
    <div className="min-h-screen pb-24 md:pb-0">
      {/* Flush with the page: same background, one hairline underneath. */}
      <header className="sticky top-0 z-40 border-b border-border bg-bg">
        <div className="mx-auto flex h-[60px] max-w-[1320px] items-center gap-10 px-4 lg:px-6">
          <Link href="/" className="flex shrink-0 items-center rounded-tag" aria-label="Pool Party home">
            <Logo />
          </Link>
          <nav className="hidden h-full items-stretch gap-7 md:flex" aria-label="Main">
            <NavLink href="/poolside" active={onFeed}>Poolside</NavLink>
            <NavLink href="/pools" active={onPools}>Pools</NavLink>
            <NavLink href="/" active={onBoard}>Leaderboard</NavLink>
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-4">
            {/* One entry: signed out -> Sign in (wallet picker or X); signed in, not joined -> Join beta; members -> account menu only. */}
            {!isSignedIn && (
              <button
                type="button"
                onClick={() => openSignIn("methods")}
                className="btn-primary"
                data-testid="header-entry"
              >
                Sign in
              </button>
            )}
            {isSignedIn && !isMember && (
              <Link href="/join" className="btn-primary" data-testid="header-entry">
                Join beta
              </Link>
            )}

            {isSignedIn && (
              <div ref={menuRef} className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label={`Account menu for ${accountName}`}
                  className="group flex min-w-0 items-center gap-2 rounded-full text-base font-medium text-fg-secondary transition hover:text-fg"
                  data-testid="user-menu-button"
                >
                  <Avatar
                    user={{ id: session?.userId || undefined, xAvatarUrl: session?.xAvatarUrl }}
                    size={30}
                  />
                  {/* Name from lg; phones and tablets show the avatar alone (the menu repeats the name). */}
                  <span className="hidden max-w-[180px] truncate lg:block">{accountName}</span>
                  <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 shrink-0 text-mute transition group-hover:text-fg ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 z-50 mt-3 w-56 overflow-hidden rounded-tile border border-border bg-surface p-1 shadow-lg shadow-black/40">
                    <div className="truncate px-3 pb-1.5 pt-2 text-sm font-medium text-mute" title={accountName}>
                      {accountName}
                    </div>
                    <Link href="/profile/me" onClick={() => setMenuOpen(false)} className={MENU_ITEM}>
                      Profile
                    </Link>
                    {isMember && (
                      <Link href="/invites" onClick={() => setMenuOpen(false)} className={MENU_ITEM}>
                        Invites
                      </Link>
                    )}
                    {!hasX && (
                      <a href={`/api/x/login?link=true&returnTo=${encodeURIComponent("/profile/me")}`} className={MENU_ITEM}>
                        <XIcon className="h-3.5 w-3.5" />
                        Link X account
                      </a>
                    )}
                    {isSignedIn && <OwnWalletRow address={hasWallet ? ownWallet : null} />}
                    <div className="mx-2 my-1 h-px bg-border" role="separator" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        handleSignOut();
                      }}
                      className={`${MENU_BASE} text-dn`}
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
      <footer className="mx-auto mt-6 flex max-w-[1320px] flex-col items-center gap-1.5 border-t border-border px-4 pb-8 pt-5 text-sm text-mute lg:flex-row lg:justify-between lg:px-6">
        <p className="text-center lg:text-left">Pool Party is an independent project, not affiliated with, endorsed by, or sponsored by Meteora.</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/terms" className="transition hover:text-fg">Terms</Link>
          <Link href="/privacy" className="transition hover:text-fg">Privacy</Link>
          <a href={meteoraHomeUrl()} target="_blank" rel="noreferrer" className="transition hover:text-fg">Meteora ↗</a>
        </div>
      </footer>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-3 bottom-3 z-40 md:hidden" aria-label="Main">
        <div className="flex items-center justify-around rounded-card border border-border bg-surface px-1 py-1.5 shadow-lg shadow-black/40">
          <TabLink href="/poolside" active={onFeed} label="Poolside" icon={<IconWaves />} />
          <TabLink href="/pools" active={onPools} label="Pools" icon={<IconPool />} />
          <TabLink href="/" active={onBoard} label="Ranks" icon={<IconTrophy />} />
          {isMember && <TabLink href="/invites" active={onInvites} label="Invites" icon={<IconTicket />} />}
          {isSignedIn && <TabLink href="/profile/me" active={onMe} label="Me" icon={<IconUser />} />}
        </div>
      </nav>

      <SignInModal open={signInOpen} initialStep={signInStep} onClose={closeSignIn} />
      <TermsConsentModal open={needsTermsConsent} onAccepted={loadSession} onSignOut={handleSignOut} />
    </div>
  );
}
