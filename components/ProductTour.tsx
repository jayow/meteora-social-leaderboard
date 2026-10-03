"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trackClient } from "@/components/EventTracker";

/**
 * First-visit guided tour: a text box beside each part of the app with Back / Next / Skip. Steps
 * point at `[data-tour="..."]` anchors (AppShell nav + tab bar, search, account menu); a step whose
 * anchor isn't visible on this screen is shown centered. AppShell starts it once per member and
 * replays it from the account menu.
 */

interface Step {
  id: string;
  /** data-tour anchor; none = centered. */
  target?: string;
  title: string;
  body: string;
  /** Required: Next stays off until the Follow button is clicked; Skip / Esc land here instead of closing. */
  follow?: boolean;
}

/** Pool Party on X. Following is a required tour step. */
export const X_ACCOUNT = "LPPoolParty";
const FOLLOW_URL = `https://x.com/intent/follow?screen_name=${X_ACCOUNT}`;

function buildSteps(opts: { hasWallet: boolean; desktop: boolean }): Step[] {
  return [
    {
      id: "welcome",
      title: "Welcome to Pool Party",
      body: "The social leaderboard for Meteora LPs. Here's a quick look at where everything lives. It takes about 30 seconds.",
    },
    {
      id: "leaderboard",
      target: "nav-leaderboard",
      title: "Leaderboard",
      body: "See who's earning on Meteora. Rank LPs by PnL, fees, volume or win rate, over 1D, 7D, 30D or all time.",
    },
    { id: "pools", target: "nav-pools", title: "Pools", body: "The pools members are LPing in right now: who's in them and how they're doing." },
    {
      id: "poolside",
      target: "nav-poolside",
      title: "Poolside",
      body: "LP ideas and activity from members: new positions, closes and badges. Hold a position in a pool to post your own LP idea there.",
    },
    {
      id: "badges",
      target: "nav-badges",
      title: "Badges",
      body: "Earn badges for fees, volume, podium finishes and the pools you LP in or create. Your progress to the next level is here.",
    },
    {
      id: "search",
      target: "search",
      title: "Search",
      body: `Find members, tokens and pools, or paste a wallet address to look up its positions.${opts.desktop ? " Press / to jump in." : ""}`,
    },
    {
      id: "account",
      target: "account",
      title: "Your account",
      body:
        "Open this menu for your profile: stats, open positions, PnL calendar and badges. Edit your name, country and banner there, and share your invite codes." +
        (opts.hasWallet ? "" : " You signed up with X, so connect your wallet here to bring in your Meteora stats."),
    },
    {
      id: "follow",
      title: "Follow Pool Party on X",
      body: `Follow @${X_ACCOUNT} for beta news, new features and top LP highlights. Tap Follow to continue.`,
      follow: true,
    },
    { id: "done", title: "You're all set", body: "Replay this tour anytime from your account menu." },
  ];
}

const PAD = 6;
const GAP = 12;
const BOX_W = 320;
const EDGE = 16;

/** The first visible element for an anchor (desktop nav and mobile tab bar share names). */
function findTarget(name: string | undefined): HTMLElement | null {
  if (!name) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function ProductTour({ open, hasWallet, onClose }: { open: boolean; hasWallet: boolean; onClose: (finished: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [followed, setFollowed] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    setSteps(buildSteps({ hasWallet, desktop: window.matchMedia("(min-width: 768px)").matches }));
    setIndex(0);
    setFollowed(false);
    trackClient("tour", { action: "start" });
  }, [open, hasWallet]);

  const step = steps[index];
  const last = index === steps.length - 1;

  // Measure the target and place the box below it (above when there's no room), inside the viewport.
  const place = useCallback(() => {
    if (!step) return;
    const el = findTarget(step.target);
    const r = el ? el.getBoundingClientRect() : null;
    setRect(r);
    const h = boxRef.current?.offsetHeight ?? 180;
    const w = Math.min(BOX_W, window.innerWidth - EDGE * 2);
    if (!r) {
      setBox({ top: Math.max(EDGE, (window.innerHeight - h) / 2), left: (window.innerWidth - w) / 2 });
      return;
    }
    const below = r.bottom + PAD + GAP;
    const top = below + h <= window.innerHeight - EDGE ? below : Math.max(EDGE, r.top - PAD - GAP - h);
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - w / 2), window.innerWidth - w - EDGE);
    setBox({ top, left });
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    findTarget(step.target)?.scrollIntoView({ block: "nearest" });
    place();
    const raf = requestAnimationFrame(place); // again once the box has its real height
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, step, place]);

  useEffect(() => {
    if (open && step) {
      primaryRef.current?.focus();
      trackClient("tour", { action: "step", step: step.id });
    }
  }, [open, step]);

  const followIndex = steps.findIndex((s) => s.follow);
  const blocked = Boolean(step?.follow) && !followed;

  const finish = useCallback(
    (finished: boolean) => {
      trackClient("tour", finished ? { action: "finish" } : { action: "skip", step: step?.id ?? null });
      onClose(finished);
    },
    [onClose, step]
  );
  /** Skip / Esc: the follow step is required, so jump there unless it's already done. */
  const skip = useCallback(() => {
    if (!followed && followIndex >= 0) {
      trackClient("tour", { action: "skip", step: step?.id ?? null });
      setIndex(followIndex);
    } else finish(false);
  }, [followed, followIndex, finish, step]);
  const next = useCallback(() => {
    if (blocked) return;
    if (last) finish(true);
    else setIndex((i) => i + 1);
  }, [blocked, last, finish]);
  const onFollow = () => {
    setFollowed(true);
    trackClient("tour", { action: "follow_click" });
  };
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, skip, next, back]);

  if (!open || !step || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-testid="product-tour">
      {/* Dim everything; the spotlight cuts a hole around the target (a huge shadow around a box). */}
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-tile border-2 border-accent transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgb(14 13 18 / 0.72)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-bg/70" />
      )}
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="card fixed p-4 shadow-lg shadow-black/40"
        style={{ top: box?.top ?? -9999, left: box?.left ?? 0, width: `min(${BOX_W}px, calc(100vw - ${EDGE * 2}px))` }}
      >
        <div className="num text-sm text-mute">
          {index + 1} of {steps.length}
        </div>
        <h2 id={titleId} className="mt-1 text-md font-semibold text-fg">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1 text-base text-fg-secondary">
          {step.body}
        </p>
        {step.follow && (
          <a
            href={FOLLOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onFollow}
            className="btn-secondary mt-3 h-10 w-full gap-2"
            data-testid="tour-follow"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            {followed ? `Following @${X_ACCOUNT}` : `Follow @${X_ACCOUNT}`}
          </a>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          {last || step.follow ? (
            <span />
          ) : (
            <button type="button" className="btn-ghost h-9 px-2" onClick={skip} data-testid="tour-skip">
              Skip tour
            </button>
          )}
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" className="btn-secondary h-9 px-3" onClick={back}>
                Back
              </button>
            )}
            <button
              ref={primaryRef}
              type="button"
              className="btn-primary h-9 px-4 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={next}
              disabled={blocked}
              title={blocked ? `Follow @${X_ACCOUNT} to continue` : undefined}
              data-testid="tour-next"
            >
              {last ? "Done" : index === 0 ? "Show me" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
