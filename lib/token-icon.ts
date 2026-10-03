import sharp from "sharp";

/**
 * Token icons through our own cache. Meteora's icon URLs point all over the web, and IPFS ones
 * (ipfs.io) are often rate-limited (HTTP 429), so they break in browsers and on share cards. Here each
 * icon is fetched once (IPFS paths retried on gateways that answer), normalised to a 128px PNG (so WebP
 * and SVG icons work on share cards too) and kept in memory.
 */

const IPFS_GATEWAYS = ["https://ipfs.filebase.io/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/"];
const TIMEOUT_MS = 6_000;
const MAX_BYTES = 2_000_000;
const MAX_ENTRIES = 500;
const FAIL_TTL_MS = 10 * 60_000;

/** Only public https hosts: no IP literals or local names (the URL comes from a query string). */
function publicHttps(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return null;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
  return u;
}

/** URLs to try, in order: IPFS content on working gateways, anything else as is. */
function candidates(raw: string): string[] {
  const ipfsPath = raw.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/)?.[1] ?? raw.match(/^https:\/\/[^/]+\/ipfs\/(.+)$/)?.[1] ?? null;
  if (ipfsPath) return IPFS_GATEWAYS.map((g) => g + ipfsPath);
  const sub = raw.match(/^https:\/\/([a-z0-9]+)\.ipfs\.[^/]+\/?(.*)$/i);
  if (sub) return IPFS_GATEWAYS.map((g) => g + sub[1] + (sub[2] ? `/${sub[2]}` : ""));
  return [raw];
}

async function fetchImage(url: string): Promise<Buffer | null> {
  if (!publicHttps(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "Mozilla/5.0 (Pool Party icon cache)" }, redirect: "follow" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    // IPFS gateways sometimes send octet-stream for images; sharp decides below.
    if (type && !type.startsWith("image/") && !type.startsWith("application/octet-stream")) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}

async function load(raw: string): Promise<Buffer | null> {
  for (const url of candidates(raw)) {
    const buf = await fetchImage(url);
    if (!buf) continue;
    try {
      return await sharp(buf, { animated: false }).resize(128, 128, { fit: "cover" }).png().toBuffer();
    } catch {
      // Not an image sharp can read; try the next gateway.
    }
  }
  return null;
}

const cache = new Map<string, { at: number; value: Promise<Buffer | null>; ok?: boolean }>();

/** The icon as a 128px PNG, or null when it can't be fetched (failures are retried after 10 minutes). */
export function tokenIconPng(raw: string): Promise<Buffer | null> {
  const hit = cache.get(raw);
  if (hit && (hit.ok !== false || Date.now() - hit.at < FAIL_TTL_MS)) return hit.value;
  if (!hit && cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  const entry: { at: number; value: Promise<Buffer | null>; ok?: boolean } = { at: Date.now(), value: load(raw) };
  void entry.value.then((v) => (entry.ok = v !== null));
  cache.set(raw, entry);
  return entry.value;
}

/** For server-rendered images (share cards): a data URI, or null. */
export async function tokenIconDataUri(raw: string | null): Promise<string | null> {
  if (!raw) return null;
  const png = await tokenIconPng(raw);
  return png ? `data:image/png;base64,${png.toString("base64")}` : null;
}
