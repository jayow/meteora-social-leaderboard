import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-[640px] flex-col items-center px-4 pb-16 pt-20 text-center sm:pt-28">
      <p className="num text-3xl font-bold tracking-tight text-mute">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-1 max-w-md text-base text-mute">
        This page doesn&apos;t exist or has been moved. Head back to the leaderboard or browse active pools.
      </p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="btn-primary">
          Leaderboard
        </Link>
        <Link href="/pools" className="btn-secondary">
          Browse pools
        </Link>
      </div>
    </main>
  );
}
