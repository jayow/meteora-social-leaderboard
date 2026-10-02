"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ApiBadge, ApiSnapshot, ApiUser } from "@/lib/api-types";
import { BadgeRow } from "@/components/Badges";
import { useMe } from "@/components/MeProvider";
import { ThesisCompact } from "@/components/ThesisCard";
import type { ThesisPost } from "@/lib/thesis-types";
import { Avatar, Flag, Pills, XIcon } from "@/components/ui";
import { PnLCalendar } from "@/components/PnLCalendar";
import { CountrySelect } from "@/components/CountrySelect";
import { Modal, ModalClose } from "@/components/Modal";
import { OpenPositions } from "@/components/OpenPositions";
import { FollowButton } from "@/components/FollowButton";
import { FollowListModal, type FollowListKind } from "@/components/FollowListModal";
import { SharePnLModal } from "@/components/SharePnLModal";
import { PositionSharingToggle } from "@/components/PositionSharing";
import { EmptyState } from "@/components/EmptyState";
import { displayName, fmtPct, fmtUsd, shortAddr, timeAgo } from "@/lib/format";
import { patchCachedProfile } from "@/lib/storage";
import { proveWallet } from "@/lib/wallet-proof-client";
import { meteoraHomeUrl } from "@/lib/meteora-links";
import { applyFollowChange, onFollowChanged, onSessionChanged, requestSignIn } from "@/lib/session-events";
import { SYNC_COOLDOWN_MS } from "@/lib/sync-limits";

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
    <Suspense fallback={<ProfileSkeleton />}>
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
  const [badges, setBadges] = useState<ApiBadge[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [range, setRange] = useState<Range>("30d");
  const [xNotice, setXNotice] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  // Owner settings (X, country, Poolside sharing) live in a modal so the public card stays a profile.
  const [editOpen, setEditOpen] = useState(() => search.get("connect") === "x");
  const [bannerEditing, setBannerEditing] = useState(false);
  const editWrap = useRef<HTMLDivElement>(null);
  // The edit panel closes on Esc or a click outside it (and its button).
  useEffect(() => {
    if (!editOpen) return;
    const onDown = (e: MouseEvent) => {
      if (editWrap.current && !editWrap.current.contains(e.target as Node)) setEditOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [editOpen]);
  const [followList, setFollowList] = useState<FollowListKind | null>(null);
  const desktop = useIsDesktop();
  const theses = useUserTheses(user?.id ?? null);
  // Latest thesis per pool: shown on that pool's open-position row; the rest list under Theses.
  const latestByPool = useMemo(() => latestThesisPerPool(theses.list), [theses.list]);
  const closeFollowList = useCallback(() => setFollowList(null), []);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/users/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("load failed");
    const d = (await res.json()) as { user: ApiUser; snapshot: ApiSnapshot | null; badges?: ApiBadge[] };
    setUser(d.user);
    setSnap(d.snapshot);
    setBadges(d.badges ?? []);
    return d.user;
  }, []);

  const sync = useCallback(
    async (wallet: string, userId: number) => {
      setSyncing(true);
      try {
        // Owner-only stats refresh. A failed sync must not break the page; we just show what's stored.
        const res = await fetch(`/api/sync/${wallet}`, { method: "POST" }).catch(() => null);
        setSyncNote(res?.status === 429 ? "Try again in a minute." : res && !res.ok ? "Couldn't reach Meteora. Showing your last stats." : null);
        await load(String(userId)).catch(() => null);
      } finally {
        setNow(Date.now());
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

  // Refresh cooldown (the server enforces the same window and just returns stored stats inside it).
  const nextSyncAt = user?.lastSyncedAt ? new Date(user.lastSyncedAt).getTime() + SYNC_COOLDOWN_MS : 0;
  const coolingDown = nextSyncAt > now;
  useEffect(() => {
    if (!coolingDown) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [coolingDown]);
  const canRefresh = mine && Boolean(user?.wallet && !user.wallet.startsWith("temp_"));

  // Returning from X OAuth.
  useEffect(() => {
    const x = search.get("x");
    // Errors are shown by AppShell (also for signed-out visitors); this handles the success notice.
    if (!x || x === "error") return;
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
        <EmptyState
          title="Your LP profile"
          action={
            <button type="button" onClick={() => requestSignIn()} className="btn-primary">
              Sign in
            </button>
          }
        >
          {me.wallet ? "Sign in with your connected wallet to see your profile, claim your rank and post your LP ideas." : "Connect Phantom or Solflare to pull your Meteora stats, claim your rank and post your LP ideas."}
        </EmptyState>
      </main>
    );
  }

  if (status === "notfound") {
    if (isMeRoute) return <OwnEmptyProfile />;
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16">
        <EmptyState
          title="Profile not found"
          action={
            <Link href="/" className="btn-secondary">
              Back to the leaderboard
            </Link>
          }
        >
          This LP isn&apos;t on Pool Party (yet).
        </EmptyState>
      </main>
    );
  }

  if (!user && (status === "error" || status === "timeout")) {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-16">
        <EmptyState
          title="Couldn't load this profile"
          action={
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn-secondary">
              Try again
            </button>
          }
        >
          {status === "timeout" ? "This is taking longer than usual." : "Something went wrong on our side."}
        </EmptyState>
      </main>
    );
  }

  if (!user) return <ProfileSkeleton note={syncing ? "Pulling stats from Meteora…" : null} />;

  const pnlBy: Record<Range, number | null> = { "7d": snap?.pnl7d ?? null, "30d": snap?.pnl30d ?? null, all: snap?.totalPnlUsd ?? null };
  const volBy: Record<Range, number | null> = { "7d": snap?.volume7dUsd ?? null, "30d": snap?.volume30dUsd ?? null, all: snap?.volumeUsd ?? null };
  const winBy: Record<Range, number | null> = { "7d": snap?.winRate7d ?? null, "30d": snap?.winRate30d ?? null, all: snap?.winRate ?? null };

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6">
      <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
        <Link href="/" className="shrink-0 text-base font-medium text-mute transition hover:text-fg">← Leaderboard</Link>
        {/* Quiet status: a short line, with the full sync note in its tooltip, and a small icon refresh. */}
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-mute">
          <span className="truncate" title={syncNote ?? undefined}>
            {syncing ? "Syncing…" : syncNote ? "Showing last saved stats" : <>Updated {timeAgo(snap?.updatedAt)}</>}
          </span>
          {/* Shown only when a refresh can run: a disabled "Refresh in 4m" next to "Updated 1m ago" said the same thing twice. */}
          {canRefresh && (syncing || !coolingDown) && (
            <button
              type="button"
              onClick={() => {
                setNow(Date.now());
                if (user?.wallet) void sync(user.wallet, user.id);
              }}
              disabled={syncing}
              title="Refresh stats from Meteora"
              aria-label={syncing ? "Refreshing stats" : "Refresh stats"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-mute transition hover:bg-surface-raised hover:text-fg disabled:opacity-45"
              data-testid="profile-refresh"
            >
              <svg viewBox="0 0 16 16" className={`h-4 w-4 ${syncing ? "animate-spin motion-reduce:animate-none" : ""}`} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {xNotice && <p className="mb-4 text-base text-fg-secondary">{xNotice}</p>}
      
      {/* Link prompts for missing methods */}
      {mine && user && (
        <>
          {!user.memberNumber && (
            <Link
              href="/join"
              className="group mb-4 block text-base"
            >
              <span className="font-semibold text-fg">You&apos;re not on the leaderboard yet</span>
              <span className="text-mute transition group-hover:text-fg"> · Got an invite code? Join the beta →</span>
            </Link>
          )}
          {(user.walletCount === undefined || user.walletCount === 0) && user.wallet && user.wallet.startsWith("temp_") && (
            <div className="mb-4 text-base">
              <span className="font-semibold text-fg">Link a wallet</span>
              <span className="text-mute"> · Connect your Solana wallet to track your Meteora stats</span>
            </div>
          )}
        </>
      )}

      {/* One surface: sections are grouped by headings, spacing and hairlines, not boxes. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Identity, with the calendar under it on desktop so it reads at a glance. */}
        <div className="h-fit min-w-0 space-y-10">
        <section>
          <ProfileBanner user={user} editing={bannerEditing} setEditing={setBannerEditing} onUpdated={() => load(target!)} />
          <div className="relative">
            <div className="relative -mt-12 flex items-end justify-between pl-4">
              <Avatar user={user} size={96} ring />
              <div ref={editWrap} className="relative mb-1 flex gap-2">
                {snap && hasActivity(snap) && (
                  <button
                    type="button"
                    onClick={() => setShareModalOpen(true)}
                    className={`shrink-0 ${mine ? "btn-primary" : "btn-secondary"}`}
                  >
                    Share PnL
                  </button>
                )}
                {mine && (
                  <button
                    type="button"
                    onClick={() => setEditOpen((v) => !v)}
                    aria-expanded={editOpen}
                    aria-controls="edit-profile-panel"
                    className="btn-secondary shrink-0"
                    data-testid="edit-profile"
                  >
                    {editOpen ? "Done" : "Edit profile"}
                  </button>
                )}
                {!mine && <FollowButton targetUser={user} />}
                {/* Edit profile opens right under its button, like a menu (floating panels may have a box). */}
                {mine && editOpen && (
                  <div
                    id="edit-profile-panel"
                    role="dialog"
                    aria-label="Edit profile"
                    className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-tile border border-border-strong bg-surface p-4 shadow-lg shadow-black/40"
                    data-testid="edit-profile-panel"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-base text-fg-secondary">Banner</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!me.verified) {
                            window.location.href = `/api/x/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
                            return;
                          }
                          setEditOpen(false);
                          setBannerEditing(true);
                        }}
                        className="btn-secondary h-8 px-3"
                      >
                        {user.bannerUpdatedAt ? "Change banner" : "Add banner"}
                      </button>
                    </div>
                    <OwnerControls user={user} focusX={search.get("connect") === "x"} onSaved={(u) => setUser(u)} />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight" title={user.xName || displayName(user)}>{user.xName || displayName(user)}</h1>
              <Flag code={user.country} className="shrink-0" />
            </div>
            {user.xHandle && (
              <a href={`https://x.com/${user.xHandle}`} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-base text-mute transition hover:text-fg">
                <XIcon className="h-3.5 w-3.5" />@{user.xHandle}
              </a>
            )}
            <BadgeRow badges={badges} className="mt-3" />
            {(user.followersCount !== undefined || user.followingCount !== undefined) && (
              <div className="mt-3 flex gap-4 text-base">
                {user.followersCount !== undefined && (
                  <button type="button" onClick={() => setFollowList("followers")} className="group" data-testid="followers-count">
                    <span className="num font-semibold text-fg">{user.followersCount}</span> <span className="text-mute transition group-hover:text-fg">{user.followersCount === 1 ? "follower" : "followers"}</span>
                  </button>
                )}
                {user.followingCount !== undefined && (
                  <button type="button" onClick={() => setFollowList("following")} className="group" data-testid="following-count">
                    <span className="num font-semibold text-fg">{user.followingCount}</span> <span className="text-mute transition group-hover:text-fg">following</span>
                  </button>
                )}
              </div>
            )}

            {/* WalletsSection hidden for now - multi-wallet feature parked */}
            {/* {mine && <WalletsSection />} */}
          </div>
        </section>
        {desktop && <CalendarCard userId={user.id} />}
        </div>

        {/* Stats, open positions, theses */}
        <div className="min-w-0 space-y-12">
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Portfolio</h2>
              <Pills value={range} onChange={setRange} options={[{ value: "7d", label: "7D" }, { value: "30d", label: "30D" }, { value: "all", label: "All" }]} />
            </div>
            {!hasActivity(snap) && (mine || !snap) && !syncing ? (
              <NoActivityStats mine={mine} />
            ) : snap ? (
              <>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
                  <div>
                    <div className="text-sm text-mute">{RANGE_LABEL[range]} PnL</div>
                    <div className={`num mt-1 text-3xl font-bold tracking-tight ${(pnlBy[range] ?? 0) >= 0 ? "text-up" : "text-dn"}`}>{fmtUsd(pnlBy[range], { signed: true, compact: false })}</div>
                  </div>
                  {range !== "all" && (
                    <div className="pb-1.5 text-base text-mute">
                      All time <span className={`num font-semibold ${(snap.totalPnlUsd ?? 0) >= 0 ? "text-up" : "text-dn"}`}>{fmtUsd(snap.totalPnlUsd, { signed: true })}</span>
                    </div>
                  )}
                </div>
                {/* Open / closed counts live with Open positions below; the range label sits on the toggle. */}
                <StatStrip>
                  <StatFigure label="Total value" value={fmtUsd(snap.portfolioValueUsd)} sub="in open positions" />
                  <StatFigure label="Win rate" value={fmtPct(winBy[range], 1)} />
                  <StatFigure label="Volume" value={fmtUsd(volBy[range])} sub="deposited" />
                  <StatFigure label="Fees earned" value={fmtUsd(range === "all" ? snap.feesUsd : snap.fees30dUsd)} sub={range === "7d" ? "last 30 days" : undefined} tone="up" />
                </StatStrip>
                {user.walletCount !== undefined && user.walletCount > 1 && (
                  <div className="mt-3 text-sm text-mute">Combined across {user.walletCount} wallets</div>
                )}
              </>
            ) : (
              <p className="text-base text-mute">{syncing ? "Pulling stats from Meteora…" : "No Meteora activity found for this wallet yet."}</p>
            )}
          </section>

          <OpenPositions userId={user.id} mine={mine} refreshKey={snap?.updatedAt ?? null} syncing={syncing} thesesByPool={latestByPool} />

          {!desktop && <CalendarCard userId={user.id} />}

          <RecentTheses theses={theses} latest={latestByPool} />
        </div>
      </div>

      {snap && (
        <SharePnLModal
          user={user}
          snap={snap}
          isOpen={shareModalOpen}
          initialRange={range}
          onClose={() => setShareModalOpen(false)}
        />
      )}
      {followList && <FollowListModal key={`${user.id}-${followList}`} userId={user.id} kind={followList} onClose={closeFollowList} />}
    </main>
  );
}

/** Desktop (lg+) layout flag; the calendar mounts in exactly one column so it fetches once. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return desktop;
}

/** Compact month calendar: a glance at daily closed PnL. */
function CalendarCard({ userId }: { userId: number }) {
  return (
    <section>
      <h2 className="mb-3 text-md font-semibold" title="Daily closed-position PnL, live from Meteora's portfolio calendar">
        PnL calendar
      </h2>
      <PnLCalendar userId={userId} compact />
    </section>
  );
}

/** Open row of figures under the hero PnL: aligned columns and space, no boxes or rules. */
function StatStrip({ children }: { children: React.ReactNode }) {
  return <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">{children}</dl>;
}

function StatFigure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-sm text-mute">{label}</dt>
      <dd className={`num mt-0.5 text-lg font-semibold ${tone === "up" ? "text-up" : "text-fg"}`}>{value}</dd>
      {sub && <dd className="truncate text-xs text-mute">{sub}</dd>}
    </div>
  );
}

/** Zeroed stats + a gentle nudge to Meteora for accounts with no LP history yet. */
function NoActivityStats({ mine }: { mine: boolean }) {
  return (
    <div data-testid="no-activity">
      <div className="text-sm text-mute">PnL</div>
      <div className="num mt-1 text-3xl font-bold tracking-tight text-fg-secondary">{fmtUsd(0, { compact: false })}</div>
      <StatStrip>
        <StatFigure label="Total value" value={fmtUsd(0)} sub="in open positions" />
        <StatFigure label="Volume" value={fmtUsd(0)} sub="deposited" />
        <StatFigure label="Fees earned" value={fmtUsd(0)} tone="up" />
      </StatStrip>
      <p className="mt-4 text-base text-mute">
        No Meteora LP activity yet.{" "}
        {mine && (
          <a href={meteoraHomeUrl()} target="_blank" rel="noreferrer" className="link">
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
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6" data-testid="own-empty-profile">
      <div className="mb-4 flex min-h-8 items-center">
        <Link href="/" className="text-base font-medium text-mute transition hover:text-fg">← Leaderboard</Link>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section className="h-fit">
          <Avatar user={{}} size={80} ring />
          <h1 className="mt-3 text-xl font-bold tracking-tight">Your LP profile</h1>
          <p className="mt-1 text-base text-mute">Sign in and join the beta to claim your spot on the leaderboard.</p>
          <Link href="/join" className="btn-primary mt-4">Join the beta</Link>
        </section>
        <section>
          <h2 className="mb-4 text-lg font-semibold">Portfolio</h2>
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
        <div>
          <p className="text-base text-mute">Sign in with X to edit your profile</p>
          <button
            type="button"
            onClick={connectX}
            className="btn-secondary mt-2"
          >
            <XIcon /> Sign in with X
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {user.xHandle ? (
          <button type="button" onClick={unlink} disabled={busy !== null} className="btn-secondary">
            Disconnect X
          </button>
        ) : (
          <button type="button" onClick={connectX} disabled={busy !== null} className={focusX ? "btn-primary" : "btn-secondary"}>
            <XIcon /> {busy === "x" ? "Connecting…" : "Connect X"}
          </button>
        )}
        <CountrySelect value={user.country || ""} onChange={saveCountry} allLabel="Set your country" disabled={busy !== null} />
      </div>
      {err && <p className="text-sm text-dn">{err}</p>}
      <PositionSharingToggle />
    </div>
  );
}

/** Profile banner; its uploader opens from the Edit profile section (`editing`). */
function ProfileBanner({ user, editing, setEditing, onUpdated }: { user: ApiUser; editing: boolean; setEditing: (v: boolean) => void; onUpdated: () => void }) {
  const { verified } = useMe();
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

  return (
    <>
      <div className="relative aspect-[3/1] max-h-36 w-full overflow-hidden rounded-tile">
        {bannerUrl ? (
          <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-surface-raised" />
        )}
      </div>

      {editing && (
        // Portaled, opaque modal so the identity card never traps it.
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
            <ModalClose
              onClick={() => {
                if (uploading) return;
                setEditing(false);
                setPreview(null);
                setFileName(null);
                setError(null);
              }}
            />
            <h3 id="banner-modal-title" className="text-xl font-semibold">Profile banner</h3>

            <div className="mt-4">
              <div
                className={`group relative aspect-[3/1] cursor-pointer overflow-hidden rounded-tile transition ${
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
                  <svg className="h-6 w-6 text-mute" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="mt-2 text-base font-semibold text-fg">Click or drag an image here</p>
                  <p className="mt-1 text-sm text-mute">JPG, PNG or WebP · up to 5MB · 3:1</p>
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

              {/* Filename display */}
              {fileName && (
                <p className="mt-2 truncate text-sm text-mute">
                  Selected: <span className="text-fg-secondary">{fileName}</span>
                </p>
              )}
            </div>

            {error && <p className="mt-2 text-sm text-dn">{error}</p>}

            <div className="mt-4 flex justify-between gap-2">
              <div>
                {bannerUrl && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={uploading}
                    className="btn-ghost text-dn hover:text-dn"
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
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={upload}
                  disabled={!preview || uploading}
                  className="btn-primary"
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
  const { publicKey, signMessage, signIn } = useWallet();
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

      const proof = await proveWallet({
        address: publicKey.toBase58(),
        statement: "Add this wallet to your Pool Party account. This is free and does not send a transaction.",
        signIn,
        signMessage,
      });

      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof }),
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
    <div className="tile mt-4 p-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-fg">Linked wallets</div>
        {publicKey && canAddMore && !currentIsLinked && (
          <button
            type="button"
            onClick={addCurrentWallet}
            disabled={adding}
            className="btn-secondary h-8 px-3"
          >
            {adding ? "Signing…" : "Link current wallet"}
          </button>
        )}
      </div>
      
      {loading ? (
        <div className="mt-3 text-sm text-mute">Loading…</div>
      ) : wallets.length === 0 ? (
        <div className="mt-3 text-sm text-mute">No wallets linked yet.</div>
      ) : (
        <div className="mt-3 space-y-2">
          {wallets.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-tile border border-border bg-surface px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="num text-base font-semibold">{shortAddr(w.address)}</span>
                  {w.isPrimary && <span className="chip">Primary</span>}
                </div>
                {w.label && <div className="mt-0.5 text-xs text-mute">{w.label}</div>}
              </div>
              <div className="flex gap-2">
                {!w.isPrimary && wallets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPrimary(w.address)}
                    disabled={busy === w.id}
                    className="text-xs font-semibold text-mute hover:text-fg disabled:opacity-50"
                  >
                    Set primary
                  </button>
                )}
                {wallets.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeWallet(w.address)}
                    disabled={busy === w.id}
                    className="text-xs font-semibold text-dn hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {error && <div className="mt-2 text-sm text-dn">{error}</div>}
      {!loading && wallets.length >= 5 && <div className="mt-2 text-xs text-mute">Maximum 5 wallets per account</div>}
    </div>
  );
}


interface UserTheses {
  list: ThesisPost[];
  total: number;
  loading: boolean;
}

/** A member's recent theses (newest first), loaded once per profile. */
function useUserTheses(userId: number | null): UserTheses {
  const [state, setState] = useState<UserTheses>({ list: [], total: 0, loading: true });
  useEffect(() => {
    if (userId == null) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fetch(`/api/users/${userId}/theses`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ theses?: ThesisPost[]; total?: number }>)
      .then((d) => live && setState({ list: d.theses || [], total: d.total ?? d.theses?.length ?? 0, loading: false }))
      .catch(() => live && setState({ list: [], total: 0, loading: false }));
    return () => {
      live = false;
    };
  }, [userId]);
  return state;
}

/** Newest thesis for each pool (theses arrive newest first, so the first one per pool wins). */
function latestThesisPerPool(list: ThesisPost[]): Map<string, ThesisPost> {
  const out = new Map<string, ThesisPost>();
  for (const t of list) if (t.pool && !out.has(t.pool.address)) out.set(t.pool.address, t);
  return out;
}

/**
 * Theses for pools the member has left (open pools show theirs on the position row), latest per pool.
 */
function RecentTheses({ theses: state, latest }: { theses: UserTheses; latest: Map<string, ThesisPost> }) {
  const [showAll, setShowAll] = useState(false);
  const { loading, total } = state;
  // One per pool (untagged old theses kept as they are), minus pools still open.
  const theses = state.list.filter((t) => (t.pool ? latest.get(t.pool.address)?.id === t.id && !t.authorInPool : true));

  const heading = (
    <h2 className="text-lg font-semibold text-fg">
      LP ideas{total > 0 ? <span className="num font-medium text-mute"> {total}</span> : null}
    </h2>
  );

  if (loading) {
    return (
      <section aria-busy="true">
        {heading}
        <div className="mt-3 space-y-2" aria-hidden>
          <div className="skeleton h-[92px] rounded-tile" />
        </div>
      </section>
    );
  }

  if (total === 0) {
    return (
      <section>
        {heading}
        <p className="mt-1 text-base text-mute">No LP ideas posted yet.</p>
      </section>
    );
  }
  // Every thesis sits on an open position above: nothing left to list here.
  if (theses.length === 0) return null;

  const shown = showAll ? theses : theses.slice(0, 3);
  return (
    <section data-testid="profile-theses">
      {heading}
      <ul className="mt-2 space-y-1">
        {shown.map((thesis) => (
          <li key={thesis.id}>
            <ThesisCompact post={thesis} />
          </li>
        ))}
      </ul>
      {!showAll && theses.length > 3 && (
        <button type="button" onClick={() => setShowAll(true)} className="btn-ghost -ml-3 mt-1 h-8 px-3">
          Show {theses.length - 3} more
        </button>
      )}
      {showAll && total > theses.length && (
        <p className="pt-2 text-sm text-mute">
          Latest {theses.length} of {total}.{" "}
          <Link href="/poolside" className="link">
            More on Poolside
          </Link>
        </p>
      )}
    </section>
  );
}

/** Loading state shaped like the real profile: identity card on the left, stats + calendar on the right. */
function ProfileSkeleton({ note = null }: { note?: string | null }) {
  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 lg:px-6" aria-busy="true" data-testid="profile-skeleton">
      <div className="mb-4 flex min-h-8 items-center justify-between">
        <div className="skeleton h-4 w-24" />
        <div className="text-sm text-mute">{note}</div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 lg:grid-cols-[340px_minmax(0,1fr)]" aria-hidden>
        <section className="h-fit">
          <div className="aspect-[3/1] max-h-36 w-full rounded-tile bg-surface-raised" />
          <div>
            <div className="-mt-12 ml-4 h-[104px] w-[104px] rounded-full border-4 border-bg bg-surface-raised" />
            <div className="skeleton mt-3 h-6 w-40" />
            <div className="skeleton mt-2 h-4 w-24" />
            <div className="skeleton mt-4 h-4 w-32" />
          </div>
        </section>
        <section className="min-w-0 space-y-12">
          <div>
            <div className="flex items-center justify-between">
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-9 w-36 rounded-full" />
            </div>
            <div className="skeleton mt-5 h-10 w-56" />
            <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="skeleton h-[52px] rounded-tile" />
              ))}
            </div>
          </div>
          <div>
            <div className="skeleton h-5 w-28" />
            <div className="skeleton mt-5 h-[240px] rounded-tile" />
          </div>
        </section>
      </div>
    </main>
  );
}
