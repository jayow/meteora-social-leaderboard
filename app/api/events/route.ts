import { NextRequest, NextResponse } from "next/server";
import { CLIENT_EVENTS, recordEvents, type ClientEvent, type EventInput } from "@/lib/events";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Browser analytics intake (components/EventTracker.tsx): page views and clicks. Write-only: it
 * never returns data, so it opens no way to read anything. Public (the beta gate's visitors count
 * too), so input is strictly bounded and rate-limited per IP; IPs are not stored.
 */

const MAX_BATCH = 50;
const MAX_PROPS = 8;
const MAX_STR = 120;
const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 400;
const hits = new Map<string, { start: number; n: number }>();

function allow(ip: string, n: number): boolean {
  const now = Date.now();
  if (hits.size > 10_000) hits.clear();
  const h = hits.get(ip);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(ip, { start: now, n });
    return n <= MAX_PER_WINDOW;
  }
  h.n += n;
  return h.n <= MAX_PER_WINDOW;
}

const isClientEvent = (v: unknown): v is ClientEvent => typeof v === "string" && (CLIENT_EVENTS as readonly string[]).includes(v);

/** Never store wallet addresses, full or shortened ("Apm4…JnHn"), whatever the browser sends. */
const redactWallets = (s: string) =>
  s.replace(/[1-9A-HJ-NP-Za-km-z]{3,6}(…|\.\.\.)[1-9A-HJ-NP-Za-km-z]{3,6}/g, "[wallet]").replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, "[wallet]");

function cleanProps(v: unknown): Record<string, string | number | boolean | null> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, val] of Object.entries(v).slice(0, MAX_PROPS)) {
    const key = k.slice(0, 40);
    if (typeof val === "string") out[key] = redactWallets(val).slice(0, MAX_STR);
    else if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
    else if (typeof val === "boolean" || val === null) out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const b = (body && typeof body === "object" ? body : {}) as { visitorId?: unknown; events?: unknown };
  const list = Array.isArray(b.events) ? b.events.slice(0, MAX_BATCH) : [];
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (list.length === 0 || !allow(ip, list.length)) return new NextResponse(null, { status: list.length ? 429 : 204 });

  const visitorId = typeof b.visitorId === "string" && /^[A-Za-z0-9-]{8,40}$/.test(b.visitorId) ? b.visitorId : null;
  const userId = await getSessionUserId();
  const rows: EventInput[] = [];
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    const { name, path, props } = e as { name?: unknown; path?: unknown; props?: unknown };
    if (!isClientEvent(name)) continue;
    rows.push({
      name,
      userId,
      visitorId,
      path: typeof path === "string" && path.startsWith("/") ? redactWallets(path.split("?")[0]).slice(0, 200) : null,
      props: cleanProps(props),
    });
  }
  await recordEvents(rows);
  return new NextResponse(null, { status: 204 });
}
