import { NextRequest } from "next/server";
import { tokenIconPng } from "@/lib/token-icon";

export const dynamic = "force-dynamic";

/** GET /api/icon?u=<icon url>: a token icon through our cache (lib/token-icon.ts), as a 128px PNG. */
export async function GET(req: NextRequest): Promise<Response> {
  const u = req.nextUrl.searchParams.get("u");
  if (!u || u.length > 1000) return new Response("Missing icon", { status: 400 });
  const png = await tokenIconPng(u);
  if (!png) return new Response("Icon unavailable", { status: 404, headers: { "Cache-Control": "public, max-age=600" } });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800, immutable" },
  });
}
