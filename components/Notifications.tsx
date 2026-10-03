"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { Modal, ModalClose } from "@/components/Modal";
import { displayName, timeAgo } from "@/lib/format";
import type { Announcement, MutableKind, NotificationItem } from "@/lib/notifications";

/**
 * Header notification bell + announcement banner (members only). Data comes from /api/notifications
 * (lib/notifications.ts): loaded on mount, on navigation (at most every 30s) and every minute while
 * the tab is visible. Opening the bell marks everything read.
 */

interface NotificationsData {
  items: NotificationItem[];
  unreadCount: number;
  muted: MutableKind[];
  announcement: Announcement | null;
}

const REFRESH_MS = 60_000;
const NAV_THROTTLE_MS = 30_000;

export function useNotifications(enabled: boolean) {
  const pathname = usePathname();
  const [data, setData] = useState<NotificationsData | null>(null);
  const lastLoad = useRef(0);

  const load = useCallback(() => {
    lastLoad.current = Date.now();
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<NotificationsData>) : null))
      .then((d) => d && setData(d))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled, load]);

  useEffect(() => {
    if (enabled && Date.now() - lastLoad.current > NAV_THROTTLE_MS) load();
  }, [enabled, pathname, load]);

  const markSeen = useCallback(() => {
    setData((d) => (d && d.unreadCount > 0 ? { ...d, unreadCount: 0 } : d));
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen" }),
    }).catch(() => undefined);
  }, []);

  const dismissAnnouncement = useCallback(() => {
    setData((d) => (d ? { ...d, announcement: null } : d));
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    }).catch(() => undefined);
  }, []);

  const saveMuted = useCallback(
    async (muted: MutableKind[]): Promise<boolean> => {
      setData((d) => (d ? { ...d, muted } : d));
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", muted }),
      }).catch(() => null);
      load();
      return Boolean(r?.ok);
    },
    [load]
  );

  return { data, markSeen, dismissAnnouncement, saveMuted };
}

function SmartLink({ href, className, onClick, children }: { href: string; className: string; onClick?: () => void; children: ReactNode }) {
  return href.startsWith("/") ? (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      {children}
    </a>
  );
}

const BellIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const MegaphoneIcon = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

const BadgeIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="9" r="6" />
    <path d="m8.5 14-1.5 7 5-3 5 3-1.5-7" />
  </svg>
);

function rowText(n: NotificationItem): ReactNode {
  const who = n.actor ? <b className="font-semibold text-fg">{n.actor.xName || displayName(n.actor)}</b> : null;
  const pool = n.poolName ? <b className="font-semibold text-fg">{n.poolName}</b> : "a pool";
  switch (n.kind) {
    case "follow":
      return <>{who} followed you</>;
    case "invite":
      return <>{who} joined Pool Party with your invite</>;
    case "like": {
      const others = (n.count ?? 1) - 1;
      return (
        <>
          {who}
          {others > 0 ? ` and ${others} other${others === 1 ? "" : "s"}` : ""} liked your LP idea{n.poolName ? <> on {pool}</> : null}
        </>
      );
    }
    case "badge":
      return (
        <>
          You earned <b className="font-semibold text-fg">{n.badge}</b>
        </>
      );
    case "opened":
      return (
        <>
          {who} opened a position in {pool}, a pool you&apos;re in
        </>
      );
    case "announcement":
      return <span className="text-fg">{n.body}</span>;
  }
}

function RowIcon({ n }: { n: NotificationItem }) {
  if (n.actor) return <Avatar user={n.actor} size={32} />;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-accent">
      {n.kind === "badge" ? <BadgeIcon /> : <MegaphoneIcon />}
    </span>
  );
}

export function NotificationBell({ data, onOpen }: { data: NotificationsData | null; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen((o) => !o);
    if (!open && unread > 0) onOpen();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="btn-ghost relative h-9 w-9 px-0"
        data-testid="notifications-bell"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="num absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold leading-none text-accent-fg" data-testid="notifications-count">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="fixed inset-x-4 top-[60px] z-50 overflow-hidden rounded-tile border border-border bg-surface shadow-lg shadow-black/40 md:absolute md:inset-x-auto md:right-0 md:top-auto md:mt-3 md:w-[360px]"
          data-testid="notifications-panel"
        >
          <div className="px-4 pb-2 pt-3 text-md font-semibold">Notifications</div>
          <div className="max-h-[min(480px,70vh)] overflow-y-auto p-1">
            {!data ? (
              <p className="px-3 py-8 text-center text-base text-mute">Loading…</p>
            ) : data.items.length === 0 ? (
              <p className="px-3 py-8 text-center text-base text-mute">Nothing yet. New followers, invites, likes and badges show up here.</p>
            ) : (
              data.items.map((n) => {
                const body = (
                  <>
                    <RowIcon n={n} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base text-fg-secondary">{rowText(n)}</span>
                      <span className="mt-0.5 block text-sm text-mute">{timeAgo(n.at)}</span>
                    </span>
                    {n.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="New" />}
                  </>
                );
                const cls = "flex items-start gap-3 rounded-tile px-3 py-2.5 transition hover:bg-surface-raised";
                return n.href ? (
                  <SmartLink key={n.key} href={n.href} className={cls} onClick={() => setOpen(false)}>
                    {body}
                  </SmartLink>
                ) : (
                  <div key={n.key} className={cls}>
                    {body}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AnnouncementBanner({ announcement, onDismiss }: { announcement: Announcement | null; onDismiss: () => void }) {
  if (!announcement) return null;
  return (
    <div className="mx-auto max-w-[1320px] px-4 pt-3 lg:px-6" data-testid="announcement-banner">
      <div className="flex items-center gap-3 rounded-tile border border-border bg-surface py-1.5 pl-3 pr-1.5">
        <span className="shrink-0 text-accent">
          <MegaphoneIcon />
        </span>
        <p className="min-w-0 flex-1 text-base text-fg-secondary">
          {announcement.body}
          {announcement.linkUrl && (
            <>
              {" "}
              <SmartLink href={announcement.linkUrl} className="whitespace-nowrap font-semibold text-fg underline-offset-2 hover:underline">
                Take a look
              </SmartLink>
            </>
          )}
        </p>
        <ModalClose onClick={onDismiss} />
      </div>
    </div>
  );
}

const SETTINGS: { kind: MutableKind; label: string; desc: string }[] = [
  { kind: "follow", label: "New followers", desc: "Someone follows you" },
  { kind: "invite", label: "Invites used", desc: "Someone joins Pool Party with your invite" },
  { kind: "like", label: "Likes on your LP ideas", desc: "Someone likes an LP idea you posted" },
  { kind: "badge", label: "Badges", desc: "You earn a badge or move up a tier" },
  { kind: "opened", label: "Positions in your pools", desc: "Someone you follow opens a position in a pool you're in" },
];

/** Account settings popup. For now just notifications: a switch per kind, saved as you flip it. */
export function SettingsModal({
  muted,
  onSave,
  onClose,
}: {
  muted: MutableKind[] | null;
  onSave: (muted: MutableKind[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const flip = async (kind: MutableKind) => {
    if (!muted) return;
    setError(null);
    const next = muted.includes(kind) ? muted.filter((k) => k !== kind) : [...muted, kind];
    if (!(await onSave(next))) setError("Couldn't save that. Try again.");
  };

  return (
    <Modal dim onClose={onClose} labelledBy="settings-title" testId="settings-modal" className="max-w-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 id="settings-title" className="text-lg font-semibold">
          Settings
        </h2>
        <ModalClose onClick={onClose} />
      </div>
      <div className="px-5 pb-5 pt-4">
        <h3 className="text-md font-semibold">Notifications</h3>
        <p className="mt-0.5 text-sm text-mute">Choose what shows up in your bell.</p>
        <div className="mt-3 divide-y divide-border">
          {SETTINGS.map((s) => {
            const on = muted ? !muted.includes(s.kind) : true;
            return (
              <div key={s.kind} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div id={`notif-${s.kind}-label`} className="text-base font-medium text-fg">
                    {s.label}
                  </div>
                  <div className="text-sm text-mute">{s.desc}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={`notif-${s.kind}-label`}
                  disabled={!muted}
                  onClick={() => void flip(s.kind)}
                  className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition disabled:opacity-45 ${
                    on ? "border-accent bg-accent" : "border-border-strong bg-surface-raised"
                  }`}
                  data-testid={`notif-switch-${s.kind}`}
                >
                  <span className={`block h-4 w-4 rounded-full transition-transform ${on ? "translate-x-[19px] bg-accent-fg" : "translate-x-[3px] bg-mute"}`} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
        {error && <p className="mt-2 text-sm text-dn">{error}</p>}
        <p className="mt-3 text-sm text-mute">Announcements from Pool Party always show.</p>
      </div>
    </Modal>
  );
}
