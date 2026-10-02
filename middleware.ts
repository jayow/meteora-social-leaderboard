import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, markSeen, sessionUserFromToken } from "@/lib/session";

/** The old Railway address; visitors there are sent to the custom domain so sign-in cookies live on one host. */
const OLD_HOST = "web-production-c8f29.up.railway.app";
const CANONICAL = "https://lppool.party";

/**
 * Private beta: only joined members see the app and its data. Everyone can reach the gate page,
 * sign-in / join, the legal pages, share-card images (link previews), health and cron.
 */
const PUBLIC_PAGES = ["/beta", "/join", "/terms", "/privacy"];
// Metrics reads (/api/admin/stats|events|users) do their own auth: admin session or Bearer METRICS_TOKEN
// (lib/metrics-auth.ts), else 404. /api/events is write-only intake.
const PUBLIC_API = ["/api/auth/", "/api/x/", "/api/join/", "/api/countries", "/api/health", "/api/cron/", "/api/card/", "/api/admin/stats", "/api/admin/events", "/api/admin/users", "/api/events"];
const STATIC_FILE = /\.(?:png|jpe?g|gif|svg|ico|webp|txt|xml|webmanifest)$/;
/** Link-preview crawlers only read meta tags; the data behind a page stays members-only. */
const PREVIEW_BOT = /Twitterbot|facebookexternalhit|Discordbot|TelegramBot|Slackbot|LinkedInBot|WhatsApp/i;

const isPublic = (pathname: string, list: string[]) =>
  list.some((p) => pathname === p || pathname === p.replace(/\/$/, "") || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  const { pathname, search } = req.nextUrl;
  if (host === OLD_HOST) {
    // Pages and X sign-in move; other APIs (cron, health) keep answering on the old host.
    if (!pathname.startsWith("/api/") || pathname.startsWith("/api/x/")) {
      return NextResponse.redirect(`${CANONICAL}${pathname}${search}`, 308);
    }
  }

  const isApi = pathname.startsWith("/api/");
  if (isApi ? isPublic(pathname, PUBLIC_API) : isPublic(pathname, PUBLIC_PAGES) || STATIC_FILE.test(pathname)) {
    return NextResponse.next();
  }
  if (!isApi && PREVIEW_BOT.test(req.headers.get("user-agent") ?? "")) return NextResponse.next();

  const user = await sessionUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (user?.joinedAt) {
    markSeen(user);
    return NextResponse.next();
  }

  if (isApi) {
    return NextResponse.json(
      { error: user ? "Members only. Join the beta with an invite code." : "Sign in to continue." },
      { status: user ? 403 : 401 }
    );
  }
  // Same URL, gate page content: after signing in / joining, a reload shows the real page.
  return NextResponse.rewrite(new URL("/beta", req.url));
}

export const config = {
  runtime: "nodejs",
  // Banner uploads skip middleware: with Node-runtime middleware, Next.js locks multipart request
  // bodies ("Response body object should not be disturbed or locked"). The route does its own
  // session + membership checks for every method.
  matcher: ["/((?!_next/|favicon.ico|api/users/[^/]+/banner).*)"],
};
