import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { Wordmark, interFonts, requestOrigin } from "@/lib/share-card";
import { NextRequest } from "next/server";
import { findUser, latestSnapshot, toPublicSnapshot } from "@/lib/users";
import { readOpenPositions } from "@/lib/open-positions";
import { readClosedPositions } from "@/lib/closed-positions";
import { displayName, fmtUsd, fmtPct } from "@/lib/format";
import { THEME } from "@/lib/theme";
import { getPool } from "@/lib/db";
import { HAS_DATA_SQL, boardOrderSql, type LeaderboardRange } from "@/lib/leaderboard-rank";

export const dynamic = "force-dynamic";
export const revalidate = 600;

/**
 * The member's PnL rank on this range's board, computed here with the leaderboard's own ordering
 * (lib/leaderboard-rank.ts). Not fetched from /api/leaderboard: the beta gate turns that internal,
 * cookie-less request away. Null when unranked (no Meteora activity yet) or on any error.
 */
async function getUserRank(userId: number, range: LeaderboardRange): Promise<number | null> {
  try {
    const { rows } = await getPool().query<{ pos: number; has_data: boolean }>(
      `WITH latest AS (
         SELECT DISTINCT ON (user_id) * FROM pnl_snapshots ORDER BY user_id, date DESC
       ), ranked AS (
         SELECT s.user_id, ${HAS_DATA_SQL} AS has_data, row_number() OVER (ORDER BY ${boardOrderSql(range, "pnl")}) AS pos
         FROM latest s JOIN users u ON u.id = s.user_id
         WHERE u.joined_at IS NOT NULL
       )
       SELECT pos::int AS pos, has_data FROM ranked WHERE user_id = $1`,
      [userId]
    );
    const r = rows[0];
    return r && r.has_data ? r.pos : null;
  } catch {
    return null;
  }
}

/** What the sharer chose to include (Share PnL checkboxes). PnL itself is always on the card. */
const CARD_PARTS = ["name", "winrate", "fees", "volume", "rank", "pool", "capital"] as const;
type CardPart = (typeof CARD_PARTS)[number];
const DEFAULT_PARTS: CardPart[] = ["name", "winrate", "fees", "rank", "pool"];

/**
 * Card background (`bg` param): pool water with floats, light or deep; the member's liquidity shape; or
 * plain. Anything else, including the retired `photo`, falls back to deep so old shared links still render.
 */
type CardBg = "pool" | "deep" | "shape" | "plain";
const parseBg = (raw: string | null): CardBg => (raw === "pool" || raw === "shape" || raw === "plain" ? raw : "deep");

/** Background images in assets/share, read once each and inlined as data URIs. */
const BG_FILE: Partial<Record<CardBg, string>> = { pool: "pool-light.jpg", deep: "pool-deep.jpg" };
const photoPromises = new Map<string, Promise<string | null>>();
function bgPhoto(bg: CardBg): Promise<string | null> {
  const file = BG_FILE[bg];
  if (!file) return Promise.resolve(null);
  if (!photoPromises.has(file)) {
    photoPromises.set(file, readFile(path.join(process.cwd(), "assets/share", file)).then((b) => `data:image/jpeg;base64,${b.toString("base64")}`).catch(() => null));
  }
  return photoPromises.get(file)!;
}

function parseParts(raw: string | null, closed: boolean): Set<CardPart> {
  if (raw === null) return new Set(closed ? ["name", "capital", "fees"] : DEFAULT_PARTS);
  return new Set(raw.split(",").filter((p): p is CardPart => (CARD_PARTS as readonly string[]).includes(p)));
}

/**
 * Backdrop: the liquidity shape of the member's largest open pool (on-chain bars from the sync), drawn
 * low across the card like the water line of a pool. Null when no position has a shape.
 */
async function poolBackdrop(userId: number): Promise<number[] | null> {
  try {
    const { pools } = await readOpenPositions(userId);
    const top = pools[0];
    const best = (top?.positions ?? []).filter((d) => d.shape && d.shape.bars.length > 0).sort((a, b) => b.valueUsd - a.valueUsd)[0];
    return best?.shape?.bars ?? null;
  } catch {
    return null;
  }
}

/** Backdrop bars: accent at ~14% over the background, solid (the image has no transparency). */
const BAR = "#2e1710";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<ImageResponse | Response> {
  try {
    const { id } = await ctx.params;
    // kind=closed&pool=<address>: one pool's result from the member's positions closed in the last 30 days.
    const closedPool = req.nextUrl.searchParams.get("kind") === "closed" ? req.nextUrl.searchParams.get("pool") ?? "" : null;
    if (closedPool !== null && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(closedPool)) {
      return new Response("Invalid pool", { status: 400 });
    }
    const range = req.nextUrl.searchParams.get("range") || "30d";
    if (!["1d", "7d", "30d", "all"].includes(range)) {
      return new Response("Invalid range", { status: 400 });
    }
    const parts = parseParts(req.nextUrl.searchParams.get("show"), closedPool !== null);
    const bg = parseBg(req.nextUrl.searchParams.get("bg"));
    const has = (p: CardPart) => parts.has(p);

    const user = await findUser(decodeURIComponent(id));
    if (!user || !user.joinedAt) {
      return new Response("User not found", { status: 404 });
    }
    let pnl: number;
    let winRate: number | null = null;
    let volume: number | null = null;
    let fees: number | null;
    let topPool: { name: string; binStep: number | null } | null = null;
    let closed: { name: string; binStep: number | null; pct: number | null; capital: number } | null = null;
    if (closedPool !== null) {
      // Same numbers as the profile's Closed positions row (same cached Meteora read).
      const pool = (await readClosedPositions(user)).pools.find((p) => p.poolAddress === closedPool);
      if (!pool) return new Response("No closed position in that pool in the last 30 days", { status: 404 });
      pnl = pool.pnlUsd;
      fees = pool.feesUsd;
      closed = { name: `${pool.tokenX}-${pool.tokenY}`, binStep: pool.binStep, pct: pool.pnlPct, capital: pool.capitalUsd };
    } else {
      const snapRow = await latestSnapshot(user.id);
      if (!snapRow) {
        return new Response("No data available", { status: 404 });
      }
      const snap = toPublicSnapshot(snapRow);
      // Same values and formatting as the profile page's Portfolio section, so the two always agree.
      pnl = ({ "1d": snap.pnl1d, "7d": snap.pnl7d, "30d": snap.pnl30d, all: snap.totalPnlUsd } as Record<string, number | null>)[range] ?? 0;
      winRate = ({ "1d": snap.winRate1d, "7d": snap.winRate7d, "30d": snap.winRate30d, all: snap.winRate } as Record<string, number | null>)[range] ?? null;
      volume = ({ "1d": snap.volume1dUsd, "7d": snap.volume7dUsd, "30d": snap.volume30dUsd, all: snap.volumeUsd } as Record<string, number | null>)[range] ?? null;
      fees = ({ "1d": snap.fees1dUsd, "7d": snap.fees7dUsd, "30d": snap.fees30dUsd, all: snap.feesUsd } as Record<string, number | null>)[range] ?? null;
      topPool = snap.topPool;
    }
    const feesLabel = "Fees earned";

    const origin = requestOrigin(req);
    const [rank, bars, fonts, photo] = await Promise.all([
      // The leaderboard has no 1-day board, so a 1D card shows no rank.
      has("rank") && !closed && range !== "1d" ? getUserRank(user.id, range as LeaderboardRange) : Promise.resolve(null),
      bg === "shape" && !closed ? poolBackdrop(user.id) : Promise.resolve(null),
      interFonts(),
      bgPhoto(bg),
    ]);

    const rangeLabel = closed
      ? `${closed.name}${closed.binStep != null ? ` · Bin ${closed.binStep}` : ""} · closed position`
      : range === "1d" ? "1-day PnL" : range === "7d" ? "7-day PnL" : range === "30d" ? "30-day PnL" : "All-time PnL";
    const handle = displayName(user);
    // X photo when there is one; otherwise the name's initial (remote SVG avatars don't render here).
    const avatar = user.xAvatarUrl ? user.xAvatarUrl.replace("_normal", "_400x400") : null;
    // Light pool water takes dark ink; every other background is dark and keeps the theme colours.
    const light = bg === "pool";
    const ink = light ? THEME.bg : THEME.fg;
    const pnlColor = light ? THEME.bg : pnl >= 0 ? THEME.up : THEME.dn;
    // Labels step up from mute on photos, where the water behind them is brighter.
    const labelColor = light ? THEME.bg : photo ? THEME.fgSecondary : THEME.mute;
    const pnlText = fmtUsd(pnl, { signed: true, compact: false });
    const pnlFontSize = pnlText.length > 12 ? 104 : pnlText.length > 10 ? 120 : 136;

    const stats: { label: string; value: string; color: string }[] = [];
    if (closed && has("capital")) stats.push({ label: "Capital", value: fmtUsd(closed.capital), color: ink });
    if (has("winrate") && !closed) stats.push({ label: "Win rate", value: fmtPct(winRate, 1), color: ink });
    if (has("fees")) stats.push({ label: feesLabel, value: fmtUsd(fees), color: light ? ink : THEME.up });
    if (has("volume") && !closed) stats.push({ label: "Volume", value: fmtUsd(volume), color: ink });
    if (has("rank") && rank) stats.push({ label: "Leaderboard", value: `#${rank}`, color: ink });

    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", backgroundColor: THEME.bg, padding: "56px 64px", fontFamily: "Inter", color: ink }}>
          {/* Backdrop: the top pool's liquidity shape, rising from the bottom right beside the figure. */}
          {/* Pool background: the floats sit on the right; the open water on the left carries the text. */}
          {photo && <img src={photo} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 630, objectFit: "cover" }} />}
          {bars && (
            <div style={{ position: "absolute", right: 64, bottom: 0, width: 440, height: 240, display: "flex", alignItems: "flex-end", gap: 4 }}>
              {bars.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${Math.max(h, h > 0 ? 6 : 0)}%`, backgroundColor: BAR, borderRadius: "2px 2px 0 0" }} />
              ))}
            </div>
          )}

          {/* Header: wordmark, then who */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Wordmark origin={origin} ink={ink} />
            </div>
            {has("name") && (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", fontSize: 28, fontWeight: 600 }}>{handle}</div>
                {avatar ? (
                  <img src={avatar} width="60" height="60" alt="" style={{ borderRadius: 999, border: `2px solid ${THEME.borderStrong}` }} />
                ) : (
                  <div style={{ display: "flex", width: 60, height: 60, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: THEME.surfaceRaised, border: `2px solid ${THEME.borderStrong}`, fontSize: 26, fontWeight: 600, color: THEME.fgSecondary }}>
                    {handle.replace(/^@/, "").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* The figure */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: labelColor }}>{rangeLabel}</div>
            {/* A closed position's % sits beside the figure, on its baseline. */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginTop: 8 }}>
              <div style={{ display: "flex", fontSize: pnlFontSize, fontWeight: 700, color: pnlColor, lineHeight: 1, letterSpacing: "-0.03em" }}>{pnlText}</div>
              {closed?.pct != null && (
                <div style={{ display: "flex", fontSize: 48, fontWeight: 600, color: pnlColor, lineHeight: 1, marginBottom: 10 }}>
                  {`${closed.pct >= 0 ? "+" : "−"}${fmtPct(Math.abs(closed.pct), 1)}`}
                </div>
              )}
            </div>
            {has("pool") && !closed && topPool && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, fontSize: 26, fontWeight: 500, color: labelColor }}>
                <span style={{ color: labelColor }}>Top pool</span>
                <span style={{ fontWeight: 600, color: ink }}>{topPool.name}</span>
                {topPool.binStep != null && <span style={{ color: labelColor }}>{`Bin ${topPool.binStep}`}</span>}
              </div>
            )}
          </div>

          {/* Supporting figures, open (no boxes) */}
          {stats.length > 0 && (
            <div style={{ display: "flex", gap: 64, marginTop: 40 }}>
              {stats.map((st) => (
                <div key={st.label} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 22, fontWeight: 500, color: labelColor }}>{st.label}</div>
                  <div style={{ display: "flex", fontSize: 42, fontWeight: 600, color: st.color, marginTop: 4 }}>{st.value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", position: "absolute", left: 64, bottom: 44, fontSize: 22, fontWeight: 600, color: labelColor }}>lppool.party</div>
        </div>
      ),
      { width: 1200, height: 630, fonts }
    );
  } catch (error) {
    console.error("Card generation error:", error);
    return new Response("Failed to generate card", { status: 500 });
  }
}
