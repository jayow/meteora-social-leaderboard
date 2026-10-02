"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Invisible analytics: page views and every button / link click, batched to /api/events. Renders
 * nothing. Records labels and paths only: never typed text, query strings or wallet addresses.
 * Server actions (sign-in, join, follow, ...) are recorded by their API routes, not here.
 */

type ClientEvent = { name: "page_view" | "click" | "outbound"; path: string; props?: Record<string, string | number | boolean | null> };

const FLUSH_MS = 4000;
const MAX_QUEUE = 20;
let queue: ClientEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function visitorId(): string | null {
  try {
    let id = window.localStorage.getItem("pp_vid");
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem("pp_vid", id);
    }
    return id;
  } catch {
    return null;
  }
}

function flush(useBeacon = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0) return;
  const body = JSON.stringify({ visitorId: visitorId(), events: queue });
  queue = [];
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // analytics must never break the page
  }
}

function track(e: ClientEvent) {
  queue.push(e);
  if (queue.length >= MAX_QUEUE) flush();
  else if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
}

function timeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Visible label of a control, without typed content: aria-label, else its short text. */
function labelOf(el: Element): string {
  const aria = el.getAttribute("aria-label");
  const text = aria ?? (el.textContent ?? "");
  return text
    .replace(/\s+/g, " ")
    // Never record wallet addresses, full or shortened ("Apm4…JnHn").
    .replace(/[1-9A-HJ-NP-Za-km-z]{3,6}(…|\.\.\.)[1-9A-HJ-NP-Za-km-z]{3,6}/g, "[wallet]")
    .replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "[wallet]")
    .trim()
    .slice(0, 60);
}

export function EventTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Timezone = coarse region (e.g. "Asia/Manila") without IPs or a location service.
    if (pathname) track({ name: "page_view", path: pathname, props: { tz: timeZone() } });
  }, [pathname]);

  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const target = ev.target instanceof Element ? ev.target.closest("a, button, [role='button'], summary") : null;
      if (!target) return;
      const path = window.location.pathname;
      const label = labelOf(target);
      const testId = target.getAttribute("data-testid");
      if (target instanceof HTMLAnchorElement && target.href) {
        const url = new URL(target.href, window.location.href);
        if (url.origin !== window.location.origin) {
          track({ name: "outbound", path, props: { host: url.host, to: url.pathname.slice(0, 120), label } });
          return;
        }
        track({ name: "click", path, props: { kind: "link", to: url.pathname.slice(0, 120), label, ...(testId ? { testId } : {}) } });
        return;
      }
      track({ name: "click", path, props: { kind: "button", label, ...(testId ? { testId } : {}) } });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  return null;
}
