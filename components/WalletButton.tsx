"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortAddr } from "@/lib/format";
import { useMe } from "@/components/MeProvider";
import { Avatar } from "@/components/ui";

export function WalletButton({ size = "md" }: { size?: "sm" | "md" }) {
  const { disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { wallet, cached } = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const h = size === "sm" ? "h-9 px-3.5 text-[13px]" : "h-10 px-4 text-[14px]";

  if (!wallet) {
    return (
      <button type="button" onClick={() => setVisible(true)} className={`${h} rounded-full bg-orange font-bold text-white shadow-lg shadow-orange/25 transition hover:bg-orange-soft`}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${h} glass flex items-center gap-2 rounded-full pl-1.5 font-semibold`}>
        <Avatar user={{ wallet, xAvatarUrl: cached.xAvatarUrl }} size={26} />
        <span className="num">{cached.xHandle ? `@${cached.xHandle}` : shortAddr(wallet)}</span>
        <span className="h-2 w-2 rounded-full bg-up" />
      </button>
      {open && (
        <div className="glass absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl bg-[#15131f]/95 p-1 text-[14px] shadow-2xl">
          <Link href="/profile/me" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 hover:bg-white/[.06]">
            My profile
          </Link>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(wallet); setOpen(false); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/[.06]">
            Copy address
          </button>
          <button type="button" onClick={() => { setVisible(true); setOpen(false); }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-white/[.06]">
            Change wallet
          </button>
          <button type="button" onClick={() => { disconnect(); setOpen(false); }} className="block w-full rounded-xl px-3 py-2 text-left text-dn hover:bg-white/[.06]">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
