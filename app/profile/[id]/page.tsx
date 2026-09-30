"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { ApiSnapshot, ApiUser } from "@/lib/api-types";
import { useMe } from "@/components/MeProvider";
import { Avatar, Flag, Pills, PoolChip, StatTile, XIcon } from "@/components/ui";
import { PnLCalendar } from "@/components/PnLCalendar";
import { CountrySelect } from "@/components/CountrySelect";
import { OpenPositions } from "@/components/OpenPositions";
import { FollowButton } from "@/components/FollowButton";
import { displayName, fmtPct, fmtUsd, timeAgo } from "@/lib/format";
import { isValidWalletClient } from "@/lib/wallet-client";
import { patchCachedProfile } from "@/lib/storage";

type Range = "7d" | "30d" | "all";
const RANGE_LABEL: Record<Range, string> = { "7d": "7D", "30d": "30D", all: "All-time" };
const APP_URL = "https://web-production-c8f29.up.railway.app";

export default function ProfilePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1200px] px-4 py-10 text-mute">Loading…</main>}>
      <Profile />
    </Suspense>
  );
}

function Profile() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const me = useMe();
  const { setVisible } = useWalletModal();
  const rawId = decodeURIComponent(params.id);
  const isMeRoute = rawId === "me";
  const target = isMeRoute ? me.wallet : rawId;

  const [user, setUser] = useState<ApiUser | null>(null);
  const [snap, setSnap] = useState<ApiSnapshot | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "notfound" | "error">("idle");
  const [syncing, setSyncing] = useState(false);
  const [range, setRange] = useState<Range>("30d");
  const [xNotice, setXNotice] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/users/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("load failed");
    const d = (await res.json()) as { user: ApiUser; snapshot: ApiSnapshot | null };
    setUser(d.user);
    setSnap(d.snapshot);
    return d.user;
  }, []);

  const sync = useCallback(
    async (wallet: string) => {
      setSyncing(true);
      try {
        await fetch(`/api/sync/${wallet}`, { method: "POST" });
        await load(wallet);
      } finally {
        setSyncing(false);
      }
    },
    [load]
  );

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const u = await load(target);
        if (cancelled) return;
        if (u) {
          setStatus("idle");
          // Redirect old wallet-based URLs to handle/id-based URLs
          if (isValidWalletClient(rawId) && rawId !== "me") {
            const newPath = u.xHandle ? `/profile/${u.xHandle}` : `/profile/${u.id}`;
            router.replace(newPath + window.location.search);
            return;
          }
          if (u.wallet) sync(u.wallet);
        } else if (isValidWalletClient(target)) {
          await sync(target);
          if (!cancelled) setStatus("idle");
        } else {
          setStatus("notfound");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, load, sync, rawId, router]);

  const mine = Boolean(me.wallet && user && user.wallet === me.wallet);

  // Returning from X OAuth.
  useEffect(() => {
    const x = search.get("x");
    if (!x) return;
    if (x === "error") setXNotice(`X connection failed: ${search.get("message") || "unknown error"}`);
    if (x === "connected") {
      fetch("/api/x/session")
        .then((r) => r.json() as Promise<{ profile: { username: string; name: string; avatarUrl: string } | null }>)
        .then((d) => {
          if (d.profile) patchCachedProfile({ xHandle: d.profile.username, xName: d.profile.name, xAvatarUrl: d.profile.avatarUrl });
          setXNotice(d.profile ? `Connected @${d.profile.username}` : null);
        })
        .catch(() => null)
        .finally(() => {
          me.refresh();
          if (target) load(target);
        });
    }
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (isMeRoute && !me.wallet) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16">
        <div className="glass rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">👛</div>
          <h1 className="mt-2 text-[24px] font-extrabold">Your LP profile</h1>
          <p className="mx-auto mt-1 max-w-sm text-[14px] text-mute">Connect Phantom or Solflare to pull your Meteora stats, claim your rank and post your thesis.</p>
          <button type="button" onClick={() => setVisible(true)} className="mt-5 h-11 rounded-full bg-orange px-6 text-[14px] font-bold shadow-lg shadow-orange/30 hover:bg-orange-soft">
            Connect wallet
          </button>
        </div>
      </main>
    );
  }

  if (status === "notfound") {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16 text-center">
        <p className="text-mute">No LP found for “{rawId}”.</p>
        <Link href="/" className="mt-4 inline-block text-orange">← Back to the leaderboard</Link>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-8">
        <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <div className="glass h-[520px] animate-pulse rounded-[28px]" />
          <div className="glass h-[520px] animate-pulse rounded-[28px]" />
        </div>
        {status === "error" && <p className="mt-4 text-dn">Couldn&apos;t load this profile.</p>}
        {syncing && <p className="mt-4 text-[13px] text-mute">Pulling stats from Meteora…</p>}
      </main>
    );
  }

  const pnlBy: Record<Range, number | null> = { "7d": snap?.pnl7d ?? null, "30d": snap?.pnl30d ?? null, all: snap?.totalPnlUsd ?? null };
  const volBy: Record<Range, number | null> = { "7d": snap?.volume7dUsd ?? null, "30d": snap?.volume30dUsd ?? null, all: snap?.volumeUsd ?? null };
  const winBy: Record<Range, number | null> = { "7d": snap?.winRate7d ?? null, "30d": snap?.winRate30d ?? null, all: snap?.winRate ?? null };
  const shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(
    `My Meteora LP stats on Pool Party: ${fmtUsd(snap?.pnl30d, { signed: true })} 30D PnL, ${fmtPct(snap?.winRate30d)} win rate 🏊‍♂️🔥`
  )}&url=${encodeURIComponent(`${APP_URL}/profile/${user.xHandle || user.id}`)}`;

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 lg:px-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-[13px] font-semibold text-mute hover:text-white">← Leaderboard</Link>
        <span className="text-[12px] text-mute">{syncing ? "Syncing with Meteora…" : `Stats updated ${timeAgo(snap?.updatedAt)}`}</span>
      </div>
      {xNotice && <div className="mb-4 rounded-2xl border border-purp/30 bg-purp/10 px-4 py-2 text-[13px] text-purp-soft">{xNotice}</div>}

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Identity card */}
        <section className="glass h-fit overflow-hidden rounded-[28px]">
          <div className="brand-grad relative h-28">
            <div className="absolute inset-0 bg-[radial-gradient(60%_120%_at_20%_0%,rgba(255,255,255,.28),transparent)]" />
          </div>
          <div className="px-5 pb-5">
            <div className="relative z-10 -mt-12 flex items-end justify-between">
              <Avatar user={user} size={96} ring />
              <div className="mb-1 flex gap-2">
                {mine ? (
                  <a href={shareUrl} target="_blank" rel="noreferrer" className="h-9 rounded-full bg-white/[.1] px-4 text-[13px] font-semibold leading-9 hover:bg-white/[.16]">
                    Share
                  </a>
                ) : (
                  <FollowButton targetUser={user} />
                )}
                {user.xHandle && (
                  <a href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.08] hover:bg-white/[.14]" title={`@${user.xHandle} on X`}>
                    <XIcon className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-extrabold tracking-tight">{user.xName || displayName(user)}</h1>
              <Flag code={user.country} className="!h-[14px] !w-[20px]" />
              {mine && <span className="rounded-full bg-orange px-2 py-0.5 text-[11px] font-extrabold">YOU</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-mute">
              {user.xHandle && (
                <a href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">
                  @{user.xHandle}{user.xVerified && <> · <XIcon className="h-3 w-3" /> verified</>}
                </a>
              )}
            </div>
            {(user.followersCount !== undefined || user.followingCount !== undefined) && (
              <div className="mt-2 flex gap-4 text-[13px]">
                {user.followersCount !== undefined && (
                  <span>
                    <span className="font-semibold text-white">{user.followersCount}</span> <span className="text-mute">{user.followersCount === 1 ? "follower" : "followers"}</span>
                  </span>
                )}
                {user.followingCount !== undefined && (
                  <span>
                    <span className="font-semibold text-white">{user.followingCount}</span> <span className="text-mute">following</span>
                  </span>
                )}
              </div>
            )}

            {mine && <OwnerControls user={user} focusX={search.get("connect") === "x"} onSaved={(u) => setUser(u)} />}

            <Thesis user={user} mine={mine} onSaved={(u) => setUser(u)} />

            {snap?.topPool && (
              <div className="mt-4 flex items-center justify-between gap-2 text-[12px] text-mute">
                <span>Top pool (30D)</span>
                <PoolChip pool={snap.topPool} />
              </div>
            )}
            <div className="mt-3 text-[11px] text-mute">Joined {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</div>
          </div>
        </section>

        {/* Stats + calendar */}
        <section className="min-w-0 space-y-5">
          <div className="glass rounded-[28px] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[18px] font-extrabold">Meteora stats</h2>
              <Pills value={range} onChange={setRange} options={[{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "all", label: "All" }]} />
            </div>
            {snap ? (
              <>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
                  <div>
                    <div className="text-[12px] font-medium text-mute">{RANGE_LABEL[range]} PnL</div>
                    <div className={`num text-[44px] font-extrabold leading-none tracking-tight ${(pnlBy[range] ?? 0) >= 0 ? "text-up" : "text-dn"}`}>{fmtUsd(pnlBy[range], { signed: true, compact: false })}</div>
                  </div>
                  <div className="pb-1 text-[13px] text-mute">
                    Lifetime DLMM PnL <span className={`num font-bold ${(snap.totalPnlUsd ?? 0) >= 0 ? "text-up" : "text-dn"}`}>{fmtUsd(snap.totalPnlUsd, { signed: true })}</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <StatTile label="Total value" value={fmtUsd(snap.portfolioValueUsd)} sub="open positions" />
                  <StatTile label={`Win rate (${RANGE_LABEL[range]})`} value={fmtPct(winBy[range], 1)} tone={(winBy[range] ?? 0) >= 50 ? "up" : "white"} />
                  <StatTile label={`Volume (${RANGE_LABEL[range]})`} value={fmtUsd(volBy[range])} sub="deposited" />
                  <StatTile label={range === "all" ? "Fees earned" : "Fees earned (30D)"} value={fmtUsd(range === "all" ? snap.feesUsd : snap.fees30dUsd)} tone="orange" />
                  <StatTile label="Open positions" value={`${snap.positionsOpen ?? 0}`} />
                  <StatTile label="Closed positions" value={`${snap.positionsClosed ?? 0}`} sub="DLMM lifetime" />
                </div>
              </>
            ) : (
              <p className="text-[14px] text-mute">{syncing ? "Pulling stats from Meteora…" : "No Meteora activity found for this wallet yet."}</p>
            )}
          </div>

          <div className="glass rounded-[28px] p-5">
            <h2 className="mb-3 text-[18px] font-extrabold">PnL calendar</h2>
            <PnLCalendar walletAddress={user.wallet} />
          </div>

          <OpenPositions walletAddress={user.wallet} />
        </section>
      </div>
    </main>
  );
}

function OwnerControls({ user, focusX, onSaved }: { user: ApiUser; focusX: boolean; onSaved: (u: ApiUser) => void }) {
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const connectX = async () => {
    setBusy("x");
    setErr(null);
    const ok = await me.verify();
    if (!ok) {
      setBusy(null);
      setErr("Sign the message in your wallet so we can link X to it.");
      return;
    }
    window.location.href = "/api/x/login";
  };

  const saveCountry = async (c: string) => {
    setBusy("country");
    setErr(null);
    const r = await me.update({ country: c || null });
    setBusy(null);
    if (!r.ok) setErr(r.error || "Couldn't save");
    else if (me.user) onSaved({ ...user, country: c || null });
  };

  const unlink = async () => {
    setBusy("unlink");
    const r = await me.update({ unlinkX: true });
    setBusy(null);
    if (!r.ok) setErr(r.error || "Couldn't unlink");
    else onSaved({ ...user, xHandle: null, xName: null, xAvatarUrl: null });
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {user.xHandle ? (
          <button type="button" onClick={unlink} disabled={busy !== null} className="h-9 rounded-full bg-white/[.06] px-3.5 text-[12px] font-semibold text-mute hover:text-white">
            Disconnect X
          </button>
        ) : (
          <button type="button" onClick={connectX} disabled={busy !== null} className={`flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold ${focusX ? "bg-orange text-white shadow-lg shadow-orange/30" : "bg-purp/25 text-purp-soft hover:bg-purp/35"}`}>
            <XIcon /> {busy === "x" ? "Check your wallet…" : "Connect X"}
          </button>
        )}
        <CountrySelect value={user.country || ""} onChange={saveCountry} allLabel="Set your country" disabled={busy !== null} />
      </div>
      {!me.verified && <p className="text-[11px] text-mute">Saving asks your wallet for a free signature to prove it&apos;s you.</p>}
      {err && <p className="text-[12px] text-dn">{err}</p>}
    </div>
  );
}

function Thesis({ user, mine, onSaved }: { user: ApiUser; mine: boolean; onSaved: (u: ApiUser) => void }) {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user.thesis || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setValue(user.thesis || ""), [user.thesis]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await me.update({ thesis: value });
    setBusy(false);
    if (!r.ok) setErr(r.error || "Couldn't save");
    else {
      onSaved({ ...user, thesis: value.trim() || null });
      setEditing(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl rounded-tl-md border border-purp/20 bg-purp/10 p-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider text-purp-soft">Thesis</div>
        {mine && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[12px] font-semibold text-orange hover:text-orange-soft">
            {user.thesis ? "Edit" : "Write one"}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="e.g. Tight bid-ask on SOL-USDC, rebalance on 2% moves. Fees > vibes."
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-[14px] outline-none focus:border-orange/60"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => { setEditing(false); setValue(user.thesis || ""); }} className="h-8 rounded-full bg-white/[.06] px-3 text-[12px] font-semibold">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={busy} className="h-8 rounded-full bg-orange px-4 text-[12px] font-bold disabled:opacity-60">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
          {err && <p className="mt-1 text-[12px] text-dn">{err}</p>}
        </>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-snug text-white/90">{user.thesis ? `“${user.thesis}”` : <span className="text-mute">{mine ? "Tell other LPs how you play the pools." : "No thesis yet."}</span>}</p>
      )}
    </div>
  );
}
