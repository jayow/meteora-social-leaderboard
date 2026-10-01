import { getPool } from "@/lib/db";
import type { OpenPositionDetail, UserRow } from "@/lib/db/schema";
import type { ComposerPool, ThesisPost } from "@/lib/thesis-types";

/**
 * Theses = token_comments. One place for the posting rule and the public shape, so Poolside, the
 * pool page and profiles agree (same rows, same counts, same pool tags).
 *
 * Posting rule: a joined member can post a thesis on a pool they hold (an open position in that exact
 * pool, from the last sync). The post is tagged with that pool. Holding another pool of the same token
 * isn't enough.
 *
 * Public rule: only non-deleted theses by joined members are listed anywhere.
 */

interface HeldPoolRow {
  pool_address: string;
  token_x: string;
  token_y: string;
  token_x_mint: string;
  token_x_icon: string | null;
  token_y_icon: string | null;
  bin_step: number | null;
  protocol: string | null;
  position_count: number | null;
}

/** Pools the user holds that a thesis can be posted on (token mint known). Largest position first. */
export async function heldPools(userId: number, filter: { mint?: string; poolAddress?: string } = {}): Promise<ComposerPool[]> {
  const params: (string | number)[] = [userId];
  const where = ["user_id = $1", "token_x_mint IS NOT NULL"];
  if (filter.mint) {
    params.push(filter.mint);
    where.push(`token_x_mint = $${params.length}`);
  }
  if (filter.poolAddress) {
    params.push(filter.poolAddress);
    where.push(`pool_address = $${params.length}`);
  }
  const { rows } = await getPool().query<HeldPoolRow>(
    `SELECT pool_address, token_x, token_y, token_x_mint, token_x_icon, token_y_icon, bin_step, protocol, position_count
     FROM open_positions WHERE ${where.join(" AND ")}
     ORDER BY value_usd DESC NULLS LAST, id`,
    params
  );
  return rows.map((r) => ({
    address: r.pool_address,
    name: `${r.token_x || "?"}-${r.token_y || "?"}`,
    tokenMint: r.token_x_mint,
    tokenSymbol: r.token_x || "?",
    xIcon: r.token_x_icon,
    yIcon: r.token_y_icon,
    binStep: r.bin_step,
    protocol: r.protocol,
    positionCount: Math.max(1, r.position_count ?? 1),
  }));
}

export type PostCheck = { ok: true; pool: ComposerPool } | { ok: false; status: number; error: string };

/** The posting rule, used by the comments API (and mirrored in the composer via heldPools). */
export async function checkCanPost(user: Pick<UserRow, "id" | "joinedAt">, mint: string, poolAddress: string | null | undefined): Promise<PostCheck> {
  if (!user.joinedAt) return { ok: false, status: 403, error: "Join the beta to post a thesis" };
  if (!poolAddress) return { ok: false, status: 400, error: "Pick the pool you're posting on" };
  const [pool] = await heldPools(user.id, { mint, poolAddress });
  if (!pool) return { ok: false, status: 403, error: "You need an open position in this pool to post on it" };
  return { ok: true, pool };
}

interface ThesisRow {
  id: number;
  token_mint: string;
  body: string;
  created_at: Date;
  pool_address: string | null;
  pool_name: string | null;
  user_id: number;
  x_handle: string | null;
  x_name: string | null;
  x_avatar_url: string | null;
  anon_name: string | null;
  joined: boolean;
  p_token_x_icon: string | null;
  p_token_y_icon: string | null;
  p_bin_step: number | null;
  p_protocol: string | null;
  t_symbol: string | null;
  t_icon: string | null;
  in_pool: boolean;
  ap_positions: OpenPositionDetail[] | null;
  ap_count: number | null;
  like_count: number;
  liked: boolean;
}

export interface ThesisFilter {
  ids?: number[];
  mint?: string;
  authorId?: number;
}

function filterSql(f: ThesisFilter, params: (string | number | number[])[]): string {
  const where = ["tc.deleted_at IS NULL", "u.joined_at IS NOT NULL"];
  if (f.ids) {
    params.push(f.ids);
    where.push(`tc.id = ANY($${params.length}::int[])`);
  }
  if (f.mint) {
    params.push(f.mint);
    where.push(`tc.token_mint = $${params.length}`);
  }
  if (f.authorId) {
    params.push(f.authorId);
    where.push(`tc.user_id = $${params.length}`);
  }
  return where.join(" AND ");
}

/** Public theses, newest first, in the shared ThesisPost shape. `viewerId` fills likedByViewer/isOwn. */
export async function listTheses(f: ThesisFilter & { viewerId: number | null; limit?: number }): Promise<ThesisPost[]> {
  if (f.ids && f.ids.length === 0) return [];
  const params: (string | number | number[])[] = [f.viewerId ?? 0];
  const where = filterSql(f, params);
  params.push(Math.min(Math.max(f.limit ?? 100, 1), 200));
  const { rows } = await getPool().query<ThesisRow>(
    `SELECT tc.id, tc.token_mint, tc.body, tc.created_at, tc.pool_address, tc.pool_name, tc.user_id,
            u.x_handle, u.x_name, u.x_avatar_url, u.anon_name, (u.joined_at IS NOT NULL) AS joined,
            p.token_x_icon AS p_token_x_icon, p.token_y_icon AS p_token_y_icon, p.bin_step AS p_bin_step, p.protocol AS p_protocol,
            t.token_x AS t_symbol, t.token_x_icon AS t_icon,
            EXISTS (SELECT 1 FROM open_positions o WHERE o.user_id = tc.user_id AND o.pool_address = tc.pool_address) AS in_pool,
            ap.positions AS ap_positions, ap.position_count AS ap_count,
            (SELECT count(*)::int FROM thesis_likes l WHERE l.comment_id = tc.id) AS like_count,
            EXISTS (SELECT 1 FROM thesis_likes l WHERE l.comment_id = tc.id AND l.user_id = $1) AS liked
     FROM token_comments tc
     JOIN users u ON u.id = tc.user_id
     LEFT JOIN LATERAL (
       SELECT o.token_x_icon, o.token_y_icon, o.bin_step, o.protocol FROM open_positions o
       WHERE o.pool_address = tc.pool_address ORDER BY (o.user_id = tc.user_id) DESC, o.id LIMIT 1
     ) p ON true
     LEFT JOIN LATERAL (
       SELECT o.token_x, o.token_x_icon FROM open_positions o
       WHERE o.token_x_mint = tc.token_mint ORDER BY (o.user_id = tc.user_id) DESC, o.id LIMIT 1
     ) t ON true
     LEFT JOIN LATERAL (
       SELECT o.positions, o.position_count FROM open_positions o
       WHERE o.user_id = tc.user_id AND o.pool_address = tc.pool_address LIMIT 1
     ) ap ON true
     WHERE ${where}
     ORDER BY tc.created_at DESC, tc.id DESC
     LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => toThesisPost(r, f.viewerId));
}

export async function countTheses(f: ThesisFilter): Promise<number> {
  const params: (string | number | number[])[] = [];
  const where = filterSql(f, params);
  const { rows } = await getPool().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM token_comments tc JOIN users u ON u.id = tc.user_id WHERE ${where}`,
    params
  );
  return rows[0]?.n ?? 0;
}

/** Summed PnL of the author's open positions in the pool, only when every position's numbers are in. */
function authorPoolPnl(r: ThesisRow): ThesisPost["authorPoolPnl"] {
  const details = r.ap_positions ?? [];
  if (details.length === 0 || details.length !== (r.ap_count || 1)) return null;
  if (!details.every((d) => d.pnlUsd != null)) return null;
  const usd = details.reduce((s, d) => s + (d.pnlUsd ?? 0), 0);
  const deposit = details.every((d) => d.depositUsd != null && d.depositUsd > 0) ? details.reduce((s, d) => s + (d.depositUsd ?? 0), 0) : null;
  return { usd, pct: deposit ? usd / deposit : details.length === 1 ? details[0].pnlPct : null };
}

function toThesisPost(r: ThesisRow, viewerId: number | null): ThesisPost {
  const poolSymbol = r.pool_name ? r.pool_name.split("-")[0] : null;
  return {
    id: r.id,
    body: r.body,
    createdAt: new Date(r.created_at).toISOString(),
    author: {
      id: r.user_id,
      xHandle: r.x_handle,
      xName: r.x_name,
      xAvatarUrl: r.x_avatar_url,
      anonName: r.anon_name,
      hasProfile: Boolean(r.joined),
    },
    token: { mint: r.token_mint, symbol: r.t_symbol ?? poolSymbol, icon: r.t_icon },
    pool:
      r.pool_address
        ? {
            address: r.pool_address,
            name: r.pool_name || `${r.t_symbol ?? "?"}-?`,
            xIcon: r.p_token_x_icon ?? r.t_icon,
            yIcon: r.p_token_y_icon,
            binStep: r.p_bin_step,
            protocol: r.p_protocol,
          }
        : null,
    authorInPool: Boolean(r.in_pool),
    authorPoolPnl: r.in_pool ? authorPoolPnl(r) : null,
    likeCount: r.like_count,
    likedByViewer: Boolean(r.liked),
    isOwn: viewerId != null && viewerId === r.user_id,
  };
}

export type LikeResult = { ok: true; liked: boolean; likeCount: number } | { ok: false; status: number; error: string };

/** Like or unlike a public thesis. Joined members only; own theses can't be liked. Idempotent. */
export async function setThesisLike(user: Pick<UserRow, "id" | "joinedAt">, commentId: number, like: boolean): Promise<LikeResult> {
  if (!user.joinedAt) return { ok: false, status: 403, error: "Join the beta to like theses" };
  const pool = getPool();
  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT tc.user_id FROM token_comments tc JOIN users u ON u.id = tc.user_id
     WHERE tc.id = $1 AND tc.deleted_at IS NULL AND u.joined_at IS NOT NULL`,
    [commentId]
  );
  const target = rows[0];
  if (!target) return { ok: false, status: 404, error: "Thesis not found" };
  if (target.user_id === user.id) return { ok: false, status: 400, error: "You can't like your own thesis" };
  if (like) {
    await pool.query(
      `INSERT INTO thesis_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT (comment_id, user_id) DO NOTHING`,
      [commentId, user.id]
    );
  } else {
    await pool.query(`DELETE FROM thesis_likes WHERE comment_id = $1 AND user_id = $2`, [commentId, user.id]);
  }
  const { rows: c } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM thesis_likes WHERE comment_id = $1`, [commentId]);
  return { ok: true, liked: like, likeCount: c[0]?.n ?? 0 };
}
