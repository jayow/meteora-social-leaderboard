"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Logo, XIcon } from "@/components/ui";
import { WalletButton } from "@/components/WalletButton";
import { useMe } from "@/components/MeProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { wallet, cached, user } = useMe();
  const { setVisible } = useWalletModal();
  const onBoard = pathname === "/";
  const onMe = pathname.startsWith("/profile");
  const onPools = pathname.startsWith("/pools");
  const onInvites = pathname === "/invites";
  const isMember = Boolean(user?.memberNumber);

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/[.06] bg-base/70 backdrop-blur-xl">
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
              <Link href="/profile/me" className={`rounded-full px-4 py-1.5 ${onMe ? "bg-white/[.1] text-white" : "text-mute hover:text-white"}`}>
                Profile
              </Link>
              <Link href="/invites" className={`rounded-full px-4 py-1.5 ${onInvites ? "bg-white/[.1] text-white" : "text-mute hover:text-white"}`}>
                Invites
              </Link>
              <a href="https://app.meteora.ag" target="_blank" rel="noreferrer" className="rounded-full px-4 py-1.5 text-mute hover:text-white">
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
            {wallet && isMember && !cached.xHandle && (
              <Link href="/profile/me?connect=x" className="hidden h-10 items-center gap-1.5 rounded-full bg-purp/20 px-4 text-[14px] font-semibold text-purp-soft hover:bg-purp/30 sm:flex">
                <XIcon /> Connect X
              </Link>
            )}
            <WalletButton size="sm" />
          </div>
        </div>
      </header>

      {children}

      {/* Mobile bottom tab bar */}
      {isMember && (
        <nav className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
          <div className="flex items-center justify-around rounded-[26px] border border-white/[.08] bg-[#15131f] px-2 py-2 shadow-2xl shadow-black/60">
            <Link href="/" className={`flex w-16 flex-col items-center gap-0.5 text-[11px] font-semibold ${onBoard ? "text-orange" : "text-mute"}`}>
              <span className="text-[20px]">🏆</span>Ranks
            </Link>
            <Link href="/pools" className={`flex w-16 flex-col items-center gap-0.5 text-[11px] font-semibold ${onPools ? "text-orange" : "text-mute"}`}>
              <span className="text-[20px]">🏊</span>Pools
            </Link>
            {wallet ? (
              <Link href="/profile/me" className="brand-grad -mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-base text-[26px] font-bold shadow-lg shadow-orange/30" aria-label="My rank">
                +
              </Link>
            ) : (
              <button type="button" onClick={() => setVisible(true)} className="brand-grad -mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-base text-[26px] font-bold shadow-lg shadow-orange/30" aria-label="Connect wallet">
                +
              </button>
            )}
            <Link href="/profile/me" className={`flex w-16 flex-col items-center gap-0.5 text-[11px] font-semibold ${onMe ? "text-orange" : "text-mute"}`}>
              <span className="text-[20px]">👤</span>Me
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
