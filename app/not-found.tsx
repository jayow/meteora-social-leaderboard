import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-[64px] font-extrabold tracking-tight">
        <span className="brand-text">404</span>
      </h1>
      <h2 className="mt-2 text-[24px] font-bold">Page not found</h2>
      <p className="mt-2 max-w-md text-[14px] text-mute">
        This page doesn&apos;t exist or has been moved. Head back to the leaderboard or browse active pools.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="h-11 rounded-full bg-orange px-6 text-[14px] font-bold leading-[44px] shadow-lg shadow-orange/30 hover:bg-orange-soft"
        >
          Leaderboard
        </Link>
        <Link
          href="/pools"
          className="h-11 rounded-full bg-white/[.08] px-6 text-[14px] font-bold leading-[44px] hover:bg-white/[.14]"
        >
          Browse pools
        </Link>
      </div>
    </div>
  );
}
