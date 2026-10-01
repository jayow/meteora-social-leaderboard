import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";

const MIN_GZIP_BYTES = 1024;

/**
 * JSON response, gzipped when the client accepts it. `next start` compresses pages but not
 * route-handler responses, so list endpoints do it themselves (Node runtime only).
 */
export function jsonMaybeGzip(req: NextRequest, body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Accept-Encoding",
    ...init.headers,
  };
  const acceptsGzip = /\bgzip\b/i.test(req.headers.get("accept-encoding") || "");
  if (!acceptsGzip || Buffer.byteLength(json) < MIN_GZIP_BYTES) {
    return new NextResponse(json, { status: init.status ?? 200, headers });
  }
  const gz = gzipSync(json, { level: 6 });
  return new NextResponse(new Uint8Array(gz), {
    status: init.status ?? 200,
    headers: { ...headers, "Content-Encoding": "gzip", "Content-Length": String(gz.length) },
  });
}
