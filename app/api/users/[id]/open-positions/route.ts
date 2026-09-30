import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { openPositions } from "@/lib/db/schema";
import { findUser } from "@/lib/users";
import { fetchMeteora } from "@/lib/meteora-limiter";

const METEORA_API_BASE = "https://dlmm.datapi.meteora.ag";

export const dynamic = "force-dynamic";

const STALE_MINUTES = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !user.joinedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();
  
  // Check if we have fresh data in open_positions table
  const positions = await db
    .select()
    .from(openPositions)
    .where(eq(openPositions.userId, user.id));

  const isFresh = positions.length > 0 && positions.every(p => {
    const ageMs = Date.now() - p.updatedAt.getTime();
    return ageMs < STALE_MINUTES * 60 * 1000;
  });

  if (isFresh && positions.length > 0) {
    // Return from DB
    const mapped = positions.map(p => ({
      poolAddress: p.poolAddress,
      tokenX: p.tokenX,
      tokenY: p.tokenY,
      tokenXIcon: p.tokenXIcon,
      tokenYIcon: p.tokenYIcon,
      binStep: p.binStep,
      protocol: p.protocol,
      valueUsd: p.valueUsd,
      positionCount: p.positionCount,
    }));
    return NextResponse.json({ positions: mapped });
  }

  // Fetch live from Meteora
  try {
    const url = `${METEORA_API_BASE}/portfolio/open?user=${user.wallet}`;
    const data = await fetchMeteora(url, 120000) as { pools?: Array<Record<string, unknown>> };
    if (data && Array.isArray(data.pools)) {
      // Strip wallet/owner fields from each position and extract needed fields
      const cleaned = (data.pools as Array<Record<string, unknown>>).map((p) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { wallet, owner, ...rest } = p;
        return {
          poolAddress: rest.poolAddress,
          tokenX: rest.tokenX,
          tokenY: rest.tokenY,
          tokenXIcon: rest.tokenXIcon,
          tokenYIcon: rest.tokenYIcon,
          binStep: rest.binStep,
          protocol: rest.protocol,
          valueUsd: rest.balances,
          positionCount: rest.openPositionCount,
        };
      });
      return NextResponse.json({ positions: cleaned });
    }
    return NextResponse.json({ positions: [] });
  } catch (error) {
    console.error("Open positions fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch open positions" }, { status: 500 });
  }
}
