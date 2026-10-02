import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { findUser } from "@/lib/users";
import { listBadges } from "@/lib/badges/compute";
import { BADGES, howEarned, isBadgeId, tierLabel, type BadgeTier } from "@/lib/badges/config";
import { BadgeGlyph } from "@/components/BadgeGlyph";
import { displayName } from "@/lib/format";
import { THEME } from "@/lib/theme";
import { Wordmark, interFonts, requestOrigin } from "@/lib/share-card";

export const dynamic = "force-dynamic";

const METAL: Record<BadgeTier, string> = { 1: THEME.bronze, 2: THEME.silver, 3: THEME.gold };

/**
 * GET /api/card/:user/badge/:badge?shape=square|wide → a share card for a badge the member holds.
 * Square (1080×1080) is what people download and post; wide (1200×630) is the link preview image.
 * Public like the PnL card (link previews), but only for badges the member actually has.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; badge: string }> }): Promise<ImageResponse | Response> {
  try {
    const { id, badge } = await ctx.params;
    if (!isBadgeId(badge)) return new Response("Unknown badge", { status: 404 });
    const wide = req.nextUrl.searchParams.get("shape") === "wide";

    const user = await findUser(decodeURIComponent(id));
    if (!user || !user.joinedAt) return new Response("User not found", { status: 404 });
    const held = (await listBadges([user.id])).get(user.id)?.find((b) => b.id === badge);
    if (!held) return new Response("Badge not earned", { status: 404 });

    // How many joined members hold this badge, and how many at this tier (a plain count; no "of N").
    const { rows } = await getPool().query<{ total: number; at_tier: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE b.tier = $2)::int AS at_tier
       FROM user_badges b JOIN users u ON u.id = b.user_id AND u.joined_at IS NOT NULL
       WHERE b.badge = $1`,
      [badge, held.tier]
    );
    const def = BADGES[badge];
    const tiered = def.tiered;
    const holders = tiered ? rows[0]?.at_tier ?? 1 : rows[0]?.total ?? 1;
    const tierName = tiered ? tierLabel(badge, held.tier)?.split(" · ")[0] ?? null : null;
    const holdersLine = `${holders.toLocaleString("en-US")} ${holders === 1 ? "member has" : "members have"} ${tierName ? `${tierName} ${def.name}` : "it"}`;
    const metal = tiered ? METAL[held.tier] : badge === "in_the_green" ? THEME.up : THEME.fgSecondary;

    const origin = requestOrigin(req);
    const fonts = await interFonts();
    const handle = displayName(user);
    const avatar = user.xAvatarUrl ? user.xAvatarUrl.replace("_normal", "_400x400") : null;
    const W = wide ? 1200 : 1080;
    const H = wide ? 630 : 1080;
    const medal = wide ? 280 : 360;

    // Pool ripples: thin concentric rings around the medal, the one decoration on the card.
    // Kept inside the card body so they never cross the header.
    const ripples = [1.3, 1.6].map((k) => (
      <div
        key={k}
        style={{ position: "absolute", width: medal * k, height: medal * k, borderRadius: 9999, border: `2px solid ${THEME.border}`, left: (medal - medal * k) / 2, top: (medal - medal * k) / 2 }}
      />
    ));

    const medalEl = (
      <div style={{ display: "flex", position: "relative", width: medal, height: medal, flexShrink: 0 }}>
        {ripples}
        <div
          style={{ display: "flex", width: medal, height: medal, borderRadius: 9999, border: `6px solid ${metal}`, backgroundColor: THEME.surfaceRaised, alignItems: "center", justifyContent: "center" }}
        >
          <BadgeGlyph id={badge} size={medal * 0.5} color={metal} />
        </div>
      </div>
    );

    const who = (
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {avatar ? (
          <img src={avatar} width="52" height="52" alt="" style={{ borderRadius: 999, border: `2px solid ${THEME.borderStrong}` }} />
        ) : (
          <div style={{ display: "flex", width: 52, height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: THEME.surfaceRaised, border: `2px solid ${THEME.borderStrong}`, fontSize: 22, fontWeight: 600, color: THEME.fgSecondary }}>
            {handle.replace(/^@/, "").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 26, fontWeight: 600 }}>{handle}</div>
      </div>
    );

    const text = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: wide ? "flex-start" : "center", textAlign: wide ? "left" : "center", maxWidth: wide ? 560 : 900 }}>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: THEME.mute }}>Badge earned</div>
        <div style={{ display: "flex", fontSize: wide ? 68 : 84, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05, marginTop: 6 }}>{def.name}</div>
        {tierName && <div style={{ display: "flex", fontSize: wide ? 34 : 40, fontWeight: 600, color: metal, marginTop: 8 }}>{tierName}</div>}
        <div style={{ display: "flex", fontSize: wide ? 26 : 30, fontWeight: 500, color: THEME.fgSecondary, marginTop: 18 }}>{howEarned(held)}</div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: THEME.mute, marginTop: 14 }}>{holdersLine}</div>
      </div>
    );

    return new ImageResponse(
      wide ? (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: THEME.bg, padding: "52px 64px", fontFamily: "Inter", color: THEME.fg }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Wordmark origin={origin} />
            {who}
          </div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 72, paddingLeft: 24 }}>
            {medalEl}
            {text}
          </div>
        </div>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: THEME.bg, padding: "64px", fontFamily: "Inter", color: THEME.fg }}>
          <div style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between" }}>
            <Wordmark origin={origin} />
            {who}
          </div>
          <div style={{ display: "flex", marginTop: 120 }}>{medalEl}</div>
          <div style={{ display: "flex", marginTop: 110 }}>{text}</div>
          <div style={{ display: "flex", position: "absolute", bottom: 44, fontSize: 22, fontWeight: 600, color: THEME.mute }}>lppool.party/badges</div>
        </div>
      ),
      { width: W, height: H, fonts }
    );
  } catch (error) {
    console.error("Badge card error:", error);
    return new Response("Failed to generate card", { status: 500 });
  }
}
