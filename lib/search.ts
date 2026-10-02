import { getPool } from "@/lib/db";
import { fetchMeteoraOrNull } from "@/lib/meteora-limiter";
import { METEORA_POOL_DISCOVERY_API } from "@/lib/meteora-endpoints";
import { isValidWallet } from "@/lib/wallet";

/**
 * Universal search (header): members, tokens and DLMM pools. Members come from our DB by X handle,
 * X name or beach name only, never by wallet (wallet -> account mapping stays private). Tokens and
 * pools come from Meteora's pool-discovery search (symbol, name, token mint or pool address),
 * cached and rate-limited through the shared Meteora limiter.
 */

export interface SearchUser {
  id: number;
  name: string;
  xHandle: string | null;
  xAvatarUrl: string | null;
  memberNumber: number | null;
  href: string;
}

export interface SearchToken {
  mint: string;
  symbol: string;
  name: string | null;
  icon: string | null;
  verified: boolean;
  href: string;
}

export interface SearchPool {
  address: string;
  name: string;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  tvl: number | null;
  href: string;
}

export interface SearchResults {
  query: string;
  /** A pasted wallet address: look up its Meteora positions (never which account owns it). */
  wallet: { address: string; href: string } | null;
  users: SearchUser[];
  tokens: SearchToken[];
  pools: SearchPool[];
}

export const SEARCH_MIN_LENGTH = 2;
const LIMIT = { users: 5, tokens: 5, pools: 6 };
const CACHE_MS = 60_000;

interface DiscoveryToken {
  address?: string;
  symbol?: string;
  name?: string;
  icon?: string | null;
  is_verified?: boolean;
}
interface DiscoveryPool {
  pool_address: string;
  name?: string;
  token_x?: DiscoveryToken;
  token_y?: DiscoveryToken;
  dlmm_params?: { bin_step?: number } | null;
  tvl?: number;
}

async function searchUsers(q: string): Promise<SearchUser[]> {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await getPool().query<{
    id: number;
    x_handle: string | null;
    x_name: string | null;
    anon_name: string | null;
    x_avatar_url: string | null;
    member_number: number | null;
  }>(
    `SELECT id, x_handle, x_name, anon_name, x_avatar_url, member_number
     FROM users
     WHERE joined_at IS NOT NULL
       AND (x_handle ILIKE $1 OR x_name ILIKE $1 OR anon_name ILIKE $1)
     ORDER BY (lower(x_handle) = lower($2)) DESC, (x_handle ILIKE $3 OR anon_name ILIKE $3) DESC, member_number ASC NULLS LAST
     LIMIT ${LIMIT.users}`,
    [like, q.replace(/^@/, ""), `${q.replace(/^@/, "").replace(/[\\%_]/g, (c) => `\\${c}`)}%`]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.x_name || (r.x_handle ? `@${r.x_handle}` : r.anon_name || `Member ${r.member_number ?? r.id}`),
    xHandle: r.x_handle,
    xAvatarUrl: r.x_avatar_url,
    memberNumber: r.member_number,
    href: `/profile/${r.x_handle || r.id}`,
  }));
}

async function searchMeteora(q: string): Promise<{ tokens: SearchToken[]; pools: SearchPool[] }> {
  const url =
    `${METEORA_POOL_DISCOVERY_API}/search?query=${encodeURIComponent(q)}` +
    `&filter_by=${encodeURIComponent("is_blacklisted=false && pool_type=dlmm")}` +
    `&sort_by=${encodeURIComponent("tvl:desc")}&page_size=30`;
  const res = await fetchMeteoraOrNull<{ data?: DiscoveryPool[] }>(url, CACHE_MS).catch(() => null);
  // Skip dead ($0 TVL) pools whenever live ones match.
  const all = res?.data ?? [];
  const live = all.filter((p) => (p.tvl ?? 0) >= 1);
  const data = live.length ? live : all;
  const pools: SearchPool[] = data.slice(0, LIMIT.pools).map((p) => ({
    address: p.pool_address,
    name: p.name || `${p.token_x?.symbol ?? "?"}-${p.token_y?.symbol ?? "?"}`,
    tokenXIcon: p.token_x?.icon ?? null,
    tokenYIcon: p.token_y?.icon ?? null,
    binStep: typeof p.dlmm_params?.bin_step === "number" ? p.dlmm_params.bin_step : null,
    tvl: typeof p.tvl === "number" ? p.tvl : null,
    href: `/pools/${p.pool_address}`,
  }));
  // Tokens: those in the matching pools that themselves match the query (so "jup" doesn't list SOL),
  // ranked by verified first, then by the TVL of the pools they appear in.
  const needle = q.toLowerCase();
  const byMint = new Map<string, { t: DiscoveryToken; tvl: number }>();
  for (const p of data) {
    for (const t of [p.token_x, p.token_y]) {
      if (!t?.address) continue;
      const hit = t.address === q || t.symbol?.toLowerCase().includes(needle) || t.name?.toLowerCase().includes(needle);
      if (!hit) continue;
      const prev = byMint.get(t.address);
      byMint.set(t.address, { t, tvl: (prev?.tvl ?? 0) + (p.tvl ?? 0) });
    }
  }
  // Match quality first (address / exact symbol, symbol prefix, symbol contains, name only), then
  // verified, then TVL: so "otter" puts the OTTER token above tokens that only mention it in their name.
  const quality = (t: DiscoveryToken) => {
    const sym = t.symbol?.toLowerCase() ?? "";
    if (t.address === q || sym === needle) return 3;
    if (sym.startsWith(needle)) return 2;
    return sym.includes(needle) ? 1 : 0;
  };
  const tokens = [...byMint.values()]
    .sort((a, b) => quality(b.t) - quality(a.t) || Number(Boolean(b.t.is_verified)) - Number(Boolean(a.t.is_verified)) || b.tvl - a.tvl)
    .slice(0, LIMIT.tokens)
    .map(({ t }) => ({
      mint: t.address as string,
      symbol: t.symbol || "?",
      name: t.name ?? null,
      icon: t.icon ?? null,
      verified: Boolean(t.is_verified),
      href: `/tokens/${t.address}`,
    }));
  return { tokens, pools };
}

export async function search(raw: string): Promise<SearchResults> {
  const q = raw.trim().slice(0, 64);
  if (q.length < SEARCH_MIN_LENGTH) return { query: q, wallet: null, users: [], tokens: [], pools: [] };
  const wallet = isValidWallet(q) ? { address: q, href: `/wallet/${q}` } : null;
  const [users, meteora] = await Promise.all([searchUsers(q).catch(() => []), searchMeteora(q)]);
  return { query: q, wallet, users, ...meteora };
}
