"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ApiSnapshot, ApiUser } from "@/lib/api-types";
import { useMe } from "@/components/MeProvider";
import { Avatar, Flag, Pills, StatTile, XIcon } from "@/components/ui";
import { PnLCalendar } from "@/components/PnLCalendar";
import { CountrySelect } from "@/components/CountrySelect";
import { Modal } from "@/components/Modal";
import { OpenPositions } from "@/components/OpenPositions";
import { FollowButton } from "@/components/FollowButton";
import { FollowListModal, type FollowListKind } from "@/components/FollowListModal";
import { SharePnLModal } from "@/components/SharePnLModal";
import { displayName, fmtPct, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { patchCachedProfile } from "@/lib/storage";
import { loginMessage } from "@/lib/login-message";
import { meteoraHomeUrl } from "@/lib/meteora-links";
import { applyFollowChange, onFollowChanged, onSessionChanged, requestSignIn } from "@/lib/session-events";

type Range = "7d" | "30d" | "all";
type LoadStatus = "idle" | "loading" | "notfound" | "error" | "timeout";
/** Give up on skeletons after this long and show a retry state instead. */
const LOAD_TIMEOUT_MS = 15000;

/** True when the snapshot shows any Meteora LP activity at all. */
function hasActivity(s: ApiSnapshot | null): boolean {
  if (!s) return false;
  return (
    (s.positionsOpen ?? 0) + (s.positionsClosed ?? 0) > 0 ||
    (s.volumeUsd ?? 0) !== 0 ||
    (s.portfolioValueUsd ?? 0) !== 0 ||
    (s.totalPnlUsd ?? 0) !== 0
  );
}

const RANGE_LABEL: Record<Range, string> = { "7d": "7D", "30d": "30D", all: "All-time" };

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
  const me = useMe();
  const rawId = decodeURIComponent(params.id);
  const isMeRoute = rawId === "me";
  // /profile/me is the signed-in user (wallet or X session), never whatever account the wallet
  // extension currently exposes. A connected-but-unsigned wallet gets the sign-in prompt.
  const meKey = me.userId ? String(me.userId) : null;
  const target = isMeRoute ? meKey : rawId;

  const [user, setUser] = useState<ApiUser | null>(null);
  const [snap, setSnap] = useState<ApiSnapshot | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [range, setRange] = useState<Range>("30d");
  const [xNotice, setXNotice] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [followList, setFollowList] = useState<FollowListKind | null>(null);
  const closeFollowList = useCallback(() => setFollowList(null), []);

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
    async (wallet: string, userId: number) => {
      setSyncing(true);
      try {
        // Owner-only stats refresh. A failed sync must not break the page; we just show what's stored.
        await fetch(`/api/sync/${wallet}`, { method: "POST" }).catch(() => null);
        await load(String(userId)).catch(() => null);
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
        // Profiles resolve by user id or X handle only. Wallet URLs are "not found" (no wallet ->
        // account lookup), and visiting never creates an account or triggers a public sync.
        const u = await load(target);
        if (cancelled) return;
        if (!u) {
          setStatus("notfound");
          return;
        }
        setStatus("idle");
        // Only the owner gets `wallet` back; refresh their stats in the background.
        if (u.wallet && !u.wallet.startsWith("temp_")) void sync(u.wallet, u.id);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, load, sync, reloadKey]);

  // Re-fetch when the signed-in user changes (e.g. just joined the beta) so the join prompt clears right away.
  useEffect(() => onSessionChanged(() => setReloadKey((k) => k + 1)), []);

  // Follow/unfollow updates the follower count and button state instantly.
  // On your own profile, your following count tracks follows made anywhere (lists, buttons).
  const meId = me.userId;
  useEffect(
    () =>
      onFollowChanged((change) =>
        setUser((u) => {
          if (!u) return u;
          let next = applyFollowChange(u, change);
          if (meId && u.id === meId && change.viewerFollowingCount !== undefined && next.followingCount !== change.viewerFollowingCount) {
            next = { ...next, followingCount: change.viewerFollowingCount };
          }
          return next;
        })
      ),
    [meId]
  );

  // Never sit on skeletons forever.
  useEffect(() => {
    if (status !== "loading" || user) return;
    const t = setTimeout(() => setStatus("timeout"), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status, user]);

  const mine = Boolean(user && (me.userId ? me.userId === user.id : me.user && me.user.id === user.id));

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

  if (isMeRoute && me.sessionChecked && !me.userId) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16">
        <div className="glass rounded-[28px] px-6 py-12 text-center">
          <div className="text-[46px]">👛</div>
          <h1 className="mt-2 text-[24px] font-extrabold">Your LP profile</h1>
          <p className="mx-auto mt-1 max-w-sm text-[14px] text-mute">
            {me.wallet ? "Sign in with your connected wallet to see your profile, claim your rank and post your thesis." : "Connect Phantom or Solflare to pull your Meteora stats, claim your rank and post your thesis."}
          </p>
          <button type="button" onClick={() => requestSignIn()} className="btn-primary mt-5 h-11 px-6 text-[14px]">
            Sign in
          </button>
        </div>
      </main>
    );
  }

  if (status === "notfound") {
    if (isMeRoute) return <OwnEmptyProfile />;
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16">
        <div className="glass rounded-[28px] px-6 py-12 text-center">
          <div className="text-[40px]">🔍</div>
          <h1 className="mt-2 text-[22px] font-extrabold">Profile not found</h1>
          <p className="mx-auto mt-1 max-w-sm text-[14px] text-mute">This LP isn&apos;t on Pool Party (yet).</p>
          <Link href="/" className="mt-5 inline-block text-[14px] font-semibold text-fg hover:underline">← Back to the leaderboard</Link>
        </div>
      </main>
    );
  }

  if (!user && (status === "error" || status === "timeout")) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16">
        <div className="glass rounded-[28px] px-6 py-12 text-center">
          <h1 className="text-[20px] font-extrabold">Couldn&apos;t load this profile</h1>
          <p className="mx-auto mt-1 max-w-sm text-[14px] text-mute">
            {status === "timeout" ? "This is taking longer than usual." : "Something went wrong on our side."}
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="mt-5 h-10 rounded-full bg-border px-5 text-[14px] font-semibold text-fg hover:bg-border-strong"
          >
            Try again
          </button>
        </div>
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
        {syncing && <p className="mt-4 text-[13px] text-mute">Pulling stats from Meteora…</p>}
      </main>
    );
  }

  const pnlBy: Record<Range, number | null> = { "7d": snap?.pnl7d ?? null, "30d": snap?.pnl30d ?? null, all: snap?.totalPnlUsd ?? null };
  const volBy: Record<Range, number | null> = { "7d": snap?.volume7dUsd ?? null, "30d": snap?.volume30dUsd ?? null, all: snap?.volumeUsd ?? null };
  const winBy: Record<Range, number | null> = { "7d": snap?.winRate7d ?? null, "30d": snap?.winRate30d ?? null, all: snap?.winRate ?? null };

  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 lg:px-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-[13px] font-semibold text-mute hover:text-fg">← Leaderboard</Link>
        <span className="text-[12px] text-mute">{syncing ? "Syncing with Meteora…" : `Stats updated ${timeAgo(snap?.updatedAt)}`}</span>
      </div>
      {xNotice && <div className="mb-4 rounded-2xl border border-border bg-surface-raised px-4 py-2 text-[13px] text-fg-secondary">{xNotice}</div>}
      
      {/* Link prompts for missing methods */}
      {mine && user && (
        <>
          {!user.memberNumber && (
            <Link
              href="/join"
              className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-surface-raised px-4 py-3 text-[14px] transition hover:border-border-strong"
            >
              <span>
                <span className="font-semibold text-fg">You&apos;re not on the leaderboard yet</span>
                <span className="ml-2 text-[13px] text-mute">Got an invite code? Join the beta</span>
              </span>
              <span className="text-[13px] text-mute">→</span>
            </Link>
          )}
          {(user.walletCount === undefined || user.walletCount === 0) && user.wallet && user.wallet.startsWith("temp_") && (
            <div className="mb-4 rounded-2xl border border-border bg-surface-raised px-4 py-3">
              <div className="flex items-center gap-2 text-[14px]">
                <span className="text-[20px]">👛</span>
                <span className="font-semibold text-fg">Link a wallet</span>
                <span className="text-[13px] text-mute">Connect your Solana wallet to track your Meteora stats</span>
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Identity card */}
        <section className="glass h-fit rounded-[28px]">
          <ProfileBanner user={user} mine={mine} onUpdated={() => load(target!)} />
          <div className="relative px-5 pb-5">
            <div className="relative -mt-12 flex items-end justify-between">
              <Avatar user={user} size={96} ring />
              <div className="mb-1 flex gap-2">
                {snap && hasActivity(snap) && (
                  <button
                    type="button"
                    onClick={() => setShareModalOpen(true)}
                    className={`h-9 shrink-0 px-3.5 text-[13px] sm:px-4 ${mine ? "btn-primary" : "btn-secondary"}`}
                  >
                    Share PnL
                  </button>
                )}
                {!mine && <FollowButton targetUser={user} />}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-extrabold tracking-tight">{user.xName || displayName(user)}</h1>
              <Flag code={user.country} className="!h-[14px] !w-[20px]" />
              {mine && <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-mute">You</span>}
            </div>
            {user.xHandle && (
              <a href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] text-mute hover:text-fg">
                <XIcon className="h-3 w-3" />@{user.xHandle}
              </a>
            )}
            {(user.followersCount !== undefined || user.followingCount !== undefined) && (
              <div className="mt-2 flex gap-4 text-[13px]">
                {user.followersCount !== undefined && (
                  <button type="button" onClick={() => setFollowList("followers")} className="hover:underline" data-testid="followers-count">
                    <span className="font-semibold text-fg">{user.followersCount}</span> <span className="text-mute">{user.followersCount === 1 ? "follower" : "followers"}</span>
                  </button>
                )}
                {user.followingCount !== undefined && (
                  <button type="button" onClick={() => setFollowList("following")} className="hover:underline" data-testid="following-count">
                    <span className="font-semibold text-fg">{user.followingCount}</span> <span className="text-mute">following</span>
                  </button>
                )}
              </div>
            )}

            {mine && <OwnerControls user={user} focusX={search.get("connect") === "x"} onSaved={(u) => setUser(u)} />}

            {/* WalletsSection hidden for now - multi-wallet feature parked */}
            {/* {mine && <WalletsSection />} */}

            <RecentTheses userId={user.id} />
          </div>
        </section>

        {/* Stats + calendar */}
        <section className="min-w-0 space-y-5">
          <div className="glass rounded-[28px] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[18px] font-extrabold">Meteora stats</h2>
              <Pills value={range} onChange={setRange} options={[{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "all", label: "All" }]} />
            </div>
            {!hasActivity(snap) && (mine || !snap) && !syncing ? (
              <NoActivityStats mine={mine} />
            ) : snap ? (
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
                  <StatTile label={`Win rate (${RANGE_LABEL[range]})`} value={fmtPct(winBy[range], 1)} />
                  <StatTile label={`Volume (${RANGE_LABEL[range]})`} value={fmtUsd(volBy[range])} sub="deposited" />
                  <StatTile label={range === "all" ? "Fees earned" : "Fees earned (30D)"} value={fmtUsd(range === "all" ? snap.feesUsd : snap.fees30dUsd)} tone="up" />
                  <StatTile label="Open positions" value={`${snap.positionsOpen ?? 0}`} />
                  <StatTile label="Closed positions" value={`${snap.positionsClosed ?? 0}`} sub="DLMM lifetime" />
                </div>
                {user.walletCount !== undefined && user.walletCount > 1 && (
                  <div className="mt-3 text-[11px] text-mute">Combined across {user.walletCount} wallets</div>
                )}
              </>
            ) : (
              <p className="text-[14px] text-mute">{syncing ? "Pulling stats from Meteora…" : "No Meteora activity found for this wallet yet."}</p>
            )}
          </div>

          <div className="glass rounded-[28px] p-5">
            <h2 className="mb-3 text-[18px] font-extrabold">PnL calendar</h2>
            <PnLCalendar userId={user.id} />
          </div>

          <OpenPositions userId={user.id} />
        </section>
      </div>

      {snap && (
        <SharePnLModal
          user={user}
          snap={snap}
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
        />
      )}
      {followList && <FollowListModal key={`${user.id}-${followList}`} userId={user.id} kind={followList} onClose={closeFollowList} />}
    </main>
  );
}

/** Zeroed stats + a gentle nudge to Meteora for accounts with no LP history yet. */
function NoActivityStats({ mine }: { mine: boolean }) {
  return (
    <div data-testid="no-activity">
      <div className="text-[12px] font-medium text-mute">PnL</div>
      <div className="num text-[44px] font-extrabold leading-none tracking-tight text-fg-secondary">{fmtUsd(0, { compact: false })}</div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Total value" value={fmtUsd(0)} sub="open positions" />
        <StatTile label="Volume" value={fmtUsd(0)} sub="deposited" />
        <StatTile label="Fees earned" value={fmtUsd(0)} tone="up" />
      </div>
      <p className="mt-4 text-[14px] text-mute">
        No Meteora LP activity yet.{" "}
        {mine && (
          <a href={meteoraHomeUrl()} target="_blank" rel="noreferrer" className="font-semibold text-fg-secondary hover:text-fg">
            Dip in ↗
          </a>
        )}
      </p>
    </div>
  );
}

/** /profile/me when the account can't be loaded (e.g. wallet connected but not signed in yet). */
function OwnEmptyProfile() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 lg:px-6" data-testid="own-empty-profile">
      <div className="mb-4">
        <Link href="/" className="text-[13px] font-semibold text-mute hover:text-fg">← Leaderboard</Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="glass h-fit rounded-[28px] p-5">
          <Avatar user={{}} size={80} ring />
          <h1 className="mt-3 text-[24px] font-extrabold tracking-tight">Your LP profile</h1>
          <p className="mt-1 text-[13px] text-mute">Sign in and join the beta to claim your spot on the leaderboard.</p>
          <Link href="/join" className="mt-4 inline-block text-[13px] font-semibold text-accent hover:text-accent-hover">Join the beta →</Link>
        </section>
        <section className="glass rounded-[28px] p-5">
          <h2 className="mb-4 text-[18px] font-extrabold">Meteora stats</h2>
          <NoActivityStats mine />
        </section>
      </div>
    </main>
  );
}

function OwnerControls({ user, focusX, onSaved }: { user: ApiUser; focusX: boolean; onSaved: (u: ApiUser) => void }) {
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const connectX = () => {
    const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/api/x/login?returnTo=${currentPath}`;
  };

  const saveCountry = async (c: string) => {
    setBusy("country");
    setErr(null);
    const r = await me.update({ country: c || null });
    setBusy(null);
    if (r.needsAuth) {
      const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/api/x/login?returnTo=${currentPath}`;
      return;
    }
    if (!r.ok) setErr(r.error || "Couldn't save");
    else onSaved({ ...user, country: c || null });
  };

  const unlink = async () => {
    setBusy("unlink");
    const r = await me.update({ unlinkX: true });
    setBusy(null);
    if (r.needsAuth) {
      const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/api/x/login?returnTo=${currentPath}`;
      return;
    }
    if (!r.ok) setErr(r.error || "Couldn't unlink");
    else onSaved({ ...user, xHandle: null, xName: null, xAvatarUrl: null });
  };

  if (!me.verified) {
    return (
      <div className="mt-4 space-y-2">
        <div className="rounded-2xl border border-border bg-surface-raised px-4 py-3 text-center">
          <p className="text-[13px] text-mute">Sign in with X to edit your profile</p>
          <button
            type="button"
            onClick={connectX}
            className="btn-secondary mt-2 h-9 px-4 text-[13px]"
          >
            <XIcon /> Sign in with X
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {user.xHandle ? (
          <button type="button" onClick={unlink} disabled={busy !== null} className="btn-ghost h-9 px-3.5 text-[12px]">
            Disconnect X
          </button>
        ) : (
          <button type="button" onClick={connectX} disabled={busy !== null} className={`h-9 px-4 text-[13px] ${focusX ? "btn-primary" : "btn-secondary"}`}>
            <XIcon /> {busy === "x" ? "Connecting…" : "Connect X"}
          </button>
        )}
        <CountrySelect value={user.country || ""} onChange={saveCountry} allLabel="Set your country" disabled={busy !== null} />
      </div>
      {err && <p className="text-[12px] text-dn">{err}</p>}
    </div>
  );
}

function ProfileBanner({ user, mine, onUpdated }: { user: ApiUser; mine: boolean; onUpdated: () => void }) {
  const { verified } = useMe();
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bannerUrl = user.bannerUpdatedAt ? `/api/users/${user.id}/banner?v=${new Date(user.bannerUpdatedAt).getTime()}` : null;

  const validateAndPreviewFile = (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Please upload a JPG, PNG, or WebP image");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("File too large. Max 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string);
      setFileName(file.name);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    validateAndPreviewFile(file);
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndPreviewFile(file);
    }
  };

  const handleClickDropzone = () => {
    fileInputRef.current?.click();
  };

  const upload = async () => {
    if (!preview) return;

    if (!verified) {
      const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/api/x/login?returnTo=${currentPath}`;
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const blob = await fetch(preview).then((r) => r.blob());
      const formData = new FormData();
      formData.append("banner", blob, "banner.webp");

      const res = await fetch(`/api/users/${user.id}/banner`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/api/x/login?returnTo=${currentPath}`;
          return;
        }
        throw new Error(data.error || "Upload failed");
      }

      setEditing(false);
      setPreview(null);
      setFileName(null);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!confirm("Remove your banner?")) return;

    if (!verified) {
      const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/api/x/login?returnTo=${currentPath}`;
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${user.id}/banner`, { method: "DELETE" });
      if (res.status === 401) {
        const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/api/x/login?returnTo=${currentPath}`;
        return;
      }
      if (!res.ok) throw new Error("Failed to remove banner");

      setEditing(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove banner");
    } finally {
      setUploading(false);
    }
  };

  const handleEditClick = () => {
    if (!verified) {
      const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/api/x/login?returnTo=${currentPath}`;
      return;
    }
    setEditing(true);
  };

  return (
    <>
      <div className="relative aspect-[3/1] w-full overflow-hidden">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-surface-raised" />
        )}
        {mine && (
          <button
            type="button"
            onClick={handleEditClick}
            className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-[12px] font-semibold text-fg hover:border-border-strong hover:bg-surface-raised"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {bannerUrl ? "Edit banner" : "Add banner"}
          </button>
        )}
      </div>

      {editing && (
        // Portaled, opaque modal: it used to be trapped inside the glass identity card.
        <Modal
          onClose={() => {
            if (uploading) return;
            setEditing(false);
            setPreview(null);
            setFileName(null);
            setError(null);
          }}
          labelledBy="banner-modal-title"
          className="max-w-lg p-6"
        >
            <h3 id="banner-modal-title" className="text-[18px] font-bold">Profile banner</h3>
            <p className="mt-1 text-[13px] text-mute">Upload a JPG, PNG, or WebP up to 5MB. It will be cropped to 3:1 aspect ratio.</p>

            <div className="mt-4">
              <div
                className={`group relative aspect-[3/1] cursor-pointer overflow-hidden rounded-xl transition-all ${
                  dragActive ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "ring-1 ring-border"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleClickDropzone}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
              >
                {preview ? (
                  <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                ) : bannerUrl ? (
                  <img src={bannerUrl} alt="Current banner" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full bg-surface-raised" />
                )}
                
                {/* Overlay on hover or when empty */}
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center bg-bg/80 transition-opacity ${
                    hovered || (!preview && !bannerUrl) ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <svg className="h-10 w-10 text-fg-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="mt-2 text-[14px] font-semibold text-fg">Click or drag an image here</p>
                  <p className="mt-1 text-[12px] text-mute">JPG, PNG or WebP · up to 5MB · 3:1</p>
                </div>
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="sr-only"
                aria-label="Upload banner image"
              />

              {/* Upload button */}
              <button
                type="button"
                onClick={handleClickDropzone}
                disabled={uploading}
                className="mt-3 h-9 w-full rounded-full bg-surface-raised px-4 text-[13px] font-semibold text-fg hover:bg-border disabled:opacity-60"
              >
                {preview ? "Replace image" : "Upload image"}
              </button>

              {/* Filename display */}
              {fileName && (
                <p className="mt-2 truncate text-[12px] text-mute">
                  Selected: <span className="text-mute">{fileName}</span>
                </p>
              )}
            </div>

            {error && <p className="mt-2 text-[12px] text-dn">{error}</p>}

            <div className="mt-4 flex justify-between gap-2">
              <div>
                {bannerUrl && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={uploading}
                    className="h-9 rounded-full bg-dn/20 px-4 text-[13px] font-semibold text-dn hover:bg-dn/30 disabled:opacity-60"
                  >
                    Remove banner
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setPreview(null);
                    setFileName(null);
                    setError(null);
                  }}
                  disabled={uploading}
                  className="h-9 rounded-full bg-surface-raised px-4 text-[13px] font-semibold disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={upload}
                  disabled={!preview || uploading}
                  className="btn-primary h-9 px-4 text-[13px] disabled:!bg-surface-raised disabled:!text-mute disabled:!opacity-100"
                >
                  {uploading ? "Uploading…" : "Save"}
                </button>
              </div>
            </div>
        </Modal>
      )}
    </>
  );
}

interface UserWallet {
  id: number;
  address: string;
  label: string | null;
  isPrimary: boolean;
  createdAt: string;
}

function WalletsSection() {
  const { ensureSession } = useMe();
  const { publicKey, signMessage } = useWallet();
  const [wallets, setWallets] = useState<UserWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallets");
      if (res.ok) {
        const data = (await res.json()) as { wallets: UserWallet[] };
        setWallets(data.wallets);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  const addCurrentWallet = async () => {
    if (!publicKey || !signMessage) return;
    setAdding(true);
    setError(null);
    try {
      if (!(await ensureSession())) {
        setError("Please sign in with your linked wallet first");
        return;
      }

      const address = publicKey.toBase58();
      const issuedAt = new Date().toISOString();
      const sig = await signMessage(new TextEncoder().encode(loginMessage(address, issuedAt)));
      const signature = btoa(String.fromCharCode(...sig));

      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, issuedAt }),
      });

      if (res.ok) {
        await loadWallets();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to add wallet");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add wallet");
    } finally {
      setAdding(false);
    }
  };

  const removeWallet = async (address: string) => {
    setBusy(wallets.find((w) => w.address === address)?.id || null);
    setError(null);
    try {
      const res = await fetch(`/api/wallets/${address}`, { method: "DELETE" });
      if (res.ok) {
        await loadWallets();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to remove wallet");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove wallet");
    } finally {
      setBusy(null);
    }
  };

  const setPrimary = async (address: string) => {
    setBusy(wallets.find((w) => w.address === address)?.id || null);
    setError(null);
    try {
      const res = await fetch(`/api/wallets/${address}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setPrimary: true }),
      });
      if (res.ok) {
        await loadWallets();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to set primary");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set primary");
    } finally {
      setBusy(null);
    }
  };

  const currentAddress = publicKey?.toBase58();
  const currentIsLinked = currentAddress && wallets.some((w) => w.address === currentAddress);
  const canAddMore = wallets.length < 5;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-bg p-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold text-fg">Linked Wallets</div>
        {publicKey && canAddMore && !currentIsLinked && (
          <button
            type="button"
            onClick={addCurrentWallet}
            disabled={adding}
            className="btn-secondary h-7 px-3 text-[12px]"
          >
            {adding ? "Signing…" : "Link current wallet"}
          </button>
        )}
      </div>
      
      {loading ? (
        <div className="mt-3 text-[12px] text-mute">Loading…</div>
      ) : wallets.length === 0 ? (
        <div className="mt-3 text-[12px] text-mute">No wallets linked yet.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {wallets.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="num text-[13px] font-semibold">{shortAddr(w.address)}</span>
                  {w.isPrimary && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-mute">PRIMARY</span>}
                </div>
                {w.label && <div className="mt-0.5 text-[11px] text-mute">{w.label}</div>}
              </div>
              <div className="flex gap-2">
                {!w.isPrimary && wallets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPrimary(w.address)}
                    disabled={busy === w.id}
                    className="text-[11px] font-semibold text-mute hover:text-fg disabled:opacity-50"
                  >
                    Set primary
                  </button>
                )}
                {wallets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeWallet(w.address)}
                    disabled={busy === w.id}
                    className="text-[11px] font-semibold text-dn hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {error && <div className="mt-2 text-[12px] text-dn">{error}</div>}
      {!loading && wallets.length >= 5 && <div className="mt-2 text-[11px] text-mute">Maximum 5 wallets per account</div>}
    </div>
  );
}


interface Thesis {
  id: number;
  tokenMint: string;
  body: string;
  createdAt: string;
  tokenSymbol: string;
  tokenIcon: string | null;
}

function RecentTheses({ userId }: { userId: number }) {
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/${userId}/theses`, { cache: "no-store" });
        const data = await res.json();
        setTheses(data.theses || []);
      } catch {
        setTheses([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  if (loading) {
    return (
      <div className="mt-4 rounded-2xl border border-border bg-surface-raised p-3.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-mute">Recent theses</div>
        <p className="mt-2 text-[13px] text-mute">Loading...</p>
      </div>
    );
  }

  if (theses.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-border bg-surface-raised p-3.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-mute">Recent theses</div>
        <p className="mt-2 text-[13px] text-mute">No theses posted yet</p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface-raised p-3.5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-mute">Recent theses</div>
      <div className="mt-2 space-y-2">
        {theses.slice(0, 3).map((thesis) => (
          <Link
            key={thesis.id}
            href={`/pools?token=${thesis.tokenMint}`}
            className="block rounded-xl border border-border bg-bg p-2.5 transition hover:border-border-strong hover:bg-surface-raised"
          >
            <div className="flex items-center gap-2">
              {thesis.tokenIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thesis.tokenIcon}
                  alt={thesis.tokenSymbol}
                  className="h-6 w-6 rounded-full border border-surface bg-surface-raised object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-surface bg-border-strong text-[10px] font-bold">
                  {thesis.tokenSymbol.slice(0, 1)}
                </div>
              )}
              <span className="text-[13px] font-semibold">{thesis.tokenSymbol}</span>
              <span className="ml-auto text-[11px] text-mute">{timeAgo(thesis.createdAt)}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-fg-secondary">
              {thesis.body}
            </p>
          </Link>
        ))}
        {theses.length > 3 && (
          <p className="pt-1 text-[11px] text-mute">+{theses.length - 3} more</p>
        )}
      </div>
    </div>
  );
}
