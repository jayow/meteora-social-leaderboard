import { NextResponse, type NextRequest } from "next/server";

/** The old Railway address; visitors there are sent to the custom domain so sign-in cookies live on one host. */
const OLD_HOST = "web-production-c8f29.up.railway.app";
const CANONICAL = "https://lppool.party";

export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  if (host !== OLD_HOST) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  // Pages and X sign-in move; other APIs (cron, health) keep answering on the old host.
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/x/")) return NextResponse.next();
  return NextResponse.redirect(`${CANONICAL}${pathname}${search}`, 308);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
