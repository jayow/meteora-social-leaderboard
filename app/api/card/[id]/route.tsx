import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { findUser, latestSnapshot } from "@/lib/users";
import { displayName, fmtUsd, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 600;

const APP_URL = "https://web-production-c8f29.up.railway.app";

async function getUserRank(userId: number, range: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
    
    const res = await fetch(`${APP_URL}/api/leaderboard?range=${range}&sort=pnl`, {
      next: { revalidate: 600 },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) return null;
    const data = await res.json() as { entries: Array<{ id: number; rank: number }> };
    const entry = data.entries.find((e) => e.id === userId);
    return entry?.rank ?? null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<ImageResponse | Response> {
  try {
    const { id } = await ctx.params;
    const range = req.nextUrl.searchParams.get("range") || "30d";

    if (!["7d", "30d", "all"].includes(range)) {
      return new Response("Invalid range", { status: 400 });
    }

    const user = await findUser(decodeURIComponent(id));
    if (!user || !user.joinedAt) {
      return new Response("User not found", { status: 404 });
    }

    const snap = await latestSnapshot(user.id);
    if (!snap) {
      return new Response("No data available", { status: 404 });
    }

    // Get PnL, fees, win rate, and top pool based on range
    const pnlMap: Record<string, number | null> = {
      "7d": snap.pnl7d,
      "30d": snap.pnl30d,
      all: snap.totalPnlUsd,
    };
    const feesMap: Record<string, number | null> = {
      "7d": null, // Not tracked
      "30d": snap.fees30dUsd,
      all: snap.feesUsd,
    };
    const winRateMap: Record<string, number | null> = {
      "7d": snap.winRate7d,
      "30d": snap.winRate30d,
      all: snap.winRate,
    };

    const pnl = pnlMap[range] ?? 0;
    const fees = feesMap[range] ?? snap.fees30dUsd ?? 0;
    const winRate = winRateMap[range];
    const topPool = snap.topPoolName || null;

    const rank = await getUserRank(user.id, range);

    const rangeLabel = range === "7d" ? "7D" : range === "30d" ? "30D" : "All-time";
    const handle = displayName(user);
    const avatar = user.xAvatarUrl
      ? user.xAvatarUrl.replace("_normal", "_400x400")
      : `https://api.dicebear.com/9.x/notionists/svg?seed=${user.id}`;

    const pnlColor = pnl >= 0 ? "#00FF94" : "#FF3D7F";
    const pnlSign = pnl > 0 ? "+" : pnl < 0 ? "" : "";

    // Fetch font from Google Fonts CDN (more reliable than gstatic)
    const fontData = await fetch(
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap"
    ).then((r) => r.arrayBuffer()).catch(() => null);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#110D14",
            backgroundImage:
              "radial-gradient(circle at 30% 20%, rgba(139, 108, 255, 0.15), transparent 40%), radial-gradient(circle at 70% 80%, rgba(255, 92, 26, 0.1), transparent 40%)",
            padding: "60px",
          }}
        >
          {/* Header: Logo + Handle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "40px",
            }}
          >
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <svg
                width="120"
                height="40"
                viewBox="0 0 302 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M90.26 55.68Q88.1 55.68 86.93 54.51Q85.76 53.35 85.76 51.14V30.2Q85.76 28 86.91 26.83Q88.05 25.66 90.17 25.66Q92.33 25.66 93.48 26.83Q94.63 28 94.63 30.2V32.19L94.15 29.6Q94.76 27.83 96.64 26.7Q98.52 25.58 100.86 25.58Q103.58 25.58 105.68 26.92Q107.78 28.26 108.97 30.77Q110.16 33.28 110.16 36.78Q110.16 40.24 108.97 42.77Q107.78 45.3 105.68 46.64Q103.58 47.98 100.86 47.98Q98.61 47.98 96.75 46.94Q94.89 45.91 94.24 44.31H94.76V51.14Q94.76 53.35 93.59 54.51Q92.42 55.68 90.26 55.68ZM97.87 41.41Q98.82 41.41 99.54 40.95Q100.25 40.5 100.68 39.48Q101.12 38.47 101.12 36.78Q101.12 34.23 100.19 33.19Q99.26 32.15 97.87 32.15Q96.96 32.15 96.23 32.61Q95.49 33.06 95.06 34.05Q94.63 35.05 94.63 36.78Q94.63 39.33 95.56 40.37Q96.49 41.41 97.87 41.41Z"
                  fill="#f6f3ff"
                />
                <path
                  d="M123.65 47.98Q119.97 47.98 117.21 46.64Q114.44 45.3 112.9 42.77Q111.37 40.24 111.37 36.78Q111.37 34.18 112.23 32.11Q113.1 30.03 114.72 28.56Q116.34 27.09 118.61 26.33Q120.88 25.58 123.65 25.58Q127.37 25.58 130.12 26.92Q132.86 28.26 134.4 30.77Q135.93 33.28 135.93 36.78Q135.93 39.37 135.07 41.45Q134.2 43.53 132.58 45Q130.96 46.47 128.69 47.23Q126.42 47.98 123.65 47.98ZM123.65 41.41Q124.6 41.41 125.32 40.95Q126.03 40.5 126.46 39.48Q126.89 38.47 126.89 36.78Q126.89 34.23 125.96 33.19Q125.03 32.15 123.65 32.15Q122.74 32.15 122.01 32.61Q121.27 33.06 120.84 34.05Q120.41 35.05 120.41 36.78Q120.41 39.33 121.34 40.37Q122.27 41.41 123.65 41.41Z"
                  fill="#f6f3ff"
                />
                <path
                  d="M149.43 47.98Q145.75 47.98 142.99 46.64Q140.22 45.3 138.68 42.77Q137.15 40.24 137.15 36.78Q137.15 34.18 138.01 32.11Q138.88 30.03 140.5 28.56Q142.12 27.09 144.39 26.33Q146.66 25.58 149.43 25.58Q153.15 25.58 155.9 26.92Q158.64 28.26 160.18 30.77Q161.71 33.28 161.71 36.78Q161.71 39.37 160.85 41.45Q159.98 43.53 158.36 45Q156.74 46.47 154.47 47.23Q152.2 47.98 149.43 47.98ZM149.43 41.41Q150.38 41.41 151.1 40.95Q151.81 40.5 152.24 39.48Q152.67 38.47 152.67 36.78Q152.67 34.23 151.74 33.19Q150.81 32.15 149.43 32.15Q148.52 32.15 147.79 32.61Q147.05 33.06 146.62 34.05Q146.19 35.05 146.19 36.78Q146.19 39.33 147.12 40.37Q148.05 41.41 149.43 41.41Z"
                  fill="#f6f3ff"
                />
                <path
                  d="M172.4 47.98Q167.9 47.98 165.84 45.65Q163.79 43.31 163.79 38.51V21.08Q163.79 18.87 164.96 17.7Q166.13 16.54 168.29 16.54Q170.45 16.54 171.62 17.7Q172.79 18.87 172.79 21.08V38.29Q172.79 39.63 173.31 40.24Q173.83 40.85 174.47 40.85Q174.78 40.85 175.12 40.76Q175.47 40.67 175.86 40.67Q176.72 40.67 177.16 41.32Q177.59 41.97 177.59 44Q177.59 45.73 176.9 46.58Q176.2 47.42 174.82 47.72Q174.52 47.77 173.76 47.87Q173 47.98 172.4 47.98Z"
                  fill="#f6f3ff"
                />
                <path
                  d="M192.04 55.68Q189.87 55.68 188.7 54.51Q187.54 53.35 187.54 51.14V30.2Q187.54 28 188.68 26.83Q189.83 25.66 191.95 25.66Q194.11 25.66 195.26 26.83Q196.4 28 196.4 30.2V32.19L195.93 29.6Q196.53 27.83 198.41 26.7Q200.3 25.58 202.63 25.58Q205.36 25.58 207.46 26.92Q209.55 28.26 210.74 30.77Q211.93 33.28 211.93 36.78Q211.93 40.24 210.74 42.77Q209.55 45.3 207.46 46.64Q205.36 47.98 202.63 47.98Q200.38 47.98 198.52 46.94Q196.66 45.91 196.01 44.31H196.53V51.14Q196.53 53.35 195.37 54.51Q194.2 55.68 192.04 55.68ZM199.65 41.41Q200.6 41.41 201.31 40.95Q202.03 40.5 202.46 39.48Q202.89 38.47 202.89 36.78Q202.89 34.23 201.96 33.19Q201.03 32.15 199.65 32.15Q198.74 32.15 198 32.61Q197.27 33.06 196.84 34.05Q196.4 35.05 196.4 36.78Q196.4 39.33 197.33 40.37Q198.26 41.41 199.65 41.41Z"
                  fill="#f6f3ff"
                />
                <path
                  d="M221.66 47.98Q219.11 47.98 217.17 47.05Q215.22 46.12 214.14 44.5Q213.06 42.88 213.06 40.8Q213.06 38.47 214.27 37.13Q215.48 35.78 218.16 35.2Q220.84 34.62 225.21 34.62H227.72V38.55H225.17Q224.04 38.55 223.24 38.79Q222.44 39.03 222.01 39.44Q221.58 39.85 221.58 40.46Q221.58 41.23 222.12 41.73Q222.66 42.23 223.78 42.23Q224.65 42.23 225.34 41.86Q226.03 41.49 226.47 40.82Q226.9 40.15 226.9 39.25V34.23Q226.9 32.97 226.21 32.52Q225.51 32.06 223.74 32.06Q222.79 32.06 221.6 32.26Q220.41 32.45 218.77 32.97Q217.43 33.41 216.47 33.04Q215.52 32.67 215.02 31.85Q214.53 31.03 214.55 30.03Q214.57 29.04 215.22 28.15Q215.87 27.26 217.21 26.79Q219.28 26.05 221.02 25.81Q222.75 25.58 224.17 25.58Q227.98 25.58 230.44 26.64Q232.91 27.7 234.14 29.9Q235.38 32.11 235.38 35.53V43.35Q235.38 45.56 234.32 46.73Q233.26 47.9 231.22 47.9Q229.19 47.9 228.11 46.73Q227.03 45.56 227.03 43.35V42.79L227.24 43.7Q227.07 45 226.34 45.95Q225.6 46.9 224.41 47.44Q223.22 47.98 221.66 47.98Z"
                  fill="#FF5C1A"
                />
                <path
                  d="M242.86 47.9Q240.61 47.9 239.42 46.73Q238.23 45.56 238.23 43.35V30.2Q238.23 28 239.38 26.83Q240.52 25.66 242.64 25.66Q244.76 25.66 245.89 26.83Q247.01 28 247.01 30.2V31.42H246.58Q246.88 28.82 248.7 27.2Q250.51 25.58 253.07 25.58Q254.49 25.58 255.16 26.33Q255.83 27.09 255.83 29.25Q255.83 31.11 255.14 32.15Q254.45 33.19 252.29 33.41L251.25 33.49Q249.17 33.67 248.29 34.55Q247.4 35.44 247.4 37.3V43.35Q247.4 45.56 246.23 46.73Q245.06 47.9 242.86 47.9Z"
                  fill="#FF5C1A"
                />
                <path
                  d="M270.45 47.98Q266.99 47.98 264.74 46.94Q262.5 45.91 261.39 43.81Q260.29 41.71 260.29 38.51V32.67H259.29Q257.69 32.67 256.81 31.83Q255.92 30.98 255.92 29.38Q255.92 27.78 256.81 26.94Q257.69 26.1 259.29 26.1H260.29V24.11Q260.29 21.9 261.46 20.73Q262.63 19.56 264.79 19.56Q266.95 19.56 268.12 20.73Q269.29 21.9 269.29 24.11V26.1H272.23Q273.87 26.1 274.74 26.94Q275.6 27.78 275.6 29.38Q275.6 30.98 274.74 31.83Q273.87 32.67 272.23 32.67H269.29V38.29Q269.29 39.59 269.96 40.2Q270.63 40.8 272.05 40.8Q272.57 40.8 273.14 40.67Q273.7 40.54 274.22 40.54Q275 40.5 275.49 41.02Q275.99 41.54 275.99 43.4Q275.99 44.91 275.54 45.93Q275.08 46.94 273.91 47.42Q273.27 47.68 272.16 47.83Q271.06 47.98 270.45 47.98Z"
                  fill="#FF5C1A"
                />
                <path
                  d="M284.08 55.68Q282.57 55.68 281.59 54.88Q280.62 54.08 280.38 52.78Q280.14 51.49 280.84 50.02L283.69 43.92V47.46L276.55 31.33Q275.9 29.82 276.14 28.54Q276.38 27.26 277.48 26.46Q278.59 25.66 280.49 25.66Q282.09 25.66 283.06 26.4Q284.04 27.13 284.86 29.3L288.36 38.64H286.8L290.57 29.21Q291.39 27.18 292.43 26.42Q293.47 25.66 295.2 25.66Q296.67 25.66 297.57 26.46Q298.48 27.26 298.7 28.54Q298.92 29.82 298.22 31.33L288.79 52.31Q287.93 54.3 286.83 54.99Q285.72 55.68 284.08 55.68Z"
                  fill="#FF5C1A"
                />
              </svg>
            </div>
            {/* Avatar + Handle */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  display: "flex",
                  fontSize: "28px",
                  fontWeight: 700,
                  color: "#FFF4EA",
                  letterSpacing: "-0.02em",
                }}
              >
                {handle}
              </div>
              <img
                src={avatar}
                width="64"
                height="64"
                alt={`${handle} avatar`}
                style={{
                  borderRadius: "50%",
                  border: "3px solid rgba(255, 255, 255, 0.2)",
                }}
              />
            </div>
          </div>

          {/* Main PnL Display */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
              justifyContent: "center",
              marginBottom: "40px",
            }}
          >
            <div
              style={{
                fontSize: "24px",
                fontWeight: 600,
                color: "#999",
                marginBottom: "16px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {rangeLabel} PnL
            </div>
            <div
              style={{
                fontSize: "120px",
                fontWeight: 900,
                color: pnlColor,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                textShadow: `0 0 80px ${pnlColor}80`,
              }}
            >
              {pnlSign}
              {fmtUsd(Math.abs(pnl), { compact: true })}
            </div>
          </div>

          {/* Stats Grid */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "20px",
              marginBottom: "40px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                borderRadius: "16px",
                padding: "20px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div style={{ fontSize: "16px", color: "#999", marginBottom: "8px" }}>
                Win Rate
              </div>
              <div style={{ fontSize: "36px", fontWeight: 800, color: "#FFF4EA" }}>
                {winRate != null ? fmtPct(winRate, 1) : "—"}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                borderRadius: "16px",
                padding: "20px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div style={{ fontSize: "16px", color: "#999", marginBottom: "8px" }}>
                Fees Earned
              </div>
              <div
                style={{ fontSize: "36px", fontWeight: 800, color: "#FF5C1A" }}
              >
                {fmtUsd(fees)}
              </div>
            </div>
            {rank && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  borderRadius: "16px",
                  padding: "20px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div style={{ fontSize: "16px", color: "#999", marginBottom: "8px" }}>
                  Rank
                </div>
                <div
                  style={{ fontSize: "36px", fontWeight: 800, color: "#8B6CFF" }}
                >
                  #{rank}
                </div>
              </div>
            )}
            {topPool && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  borderRadius: "16px",
                  padding: "20px",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div style={{ fontSize: "16px", color: "#999", marginBottom: "8px" }}>
                  Top Pool
                </div>
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#FFF4EA",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {topPool}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: 600,
              color: "#8B6CFF",
              letterSpacing: "0.02em",
            }}
          >
            Party starts here 🏖️
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error("Card generation error:", error);
    return new Response("Failed to generate card", { status: 500 });
  }
}
