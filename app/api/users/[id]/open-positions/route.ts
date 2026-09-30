import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { openPositions, userWallets } from "@/lib/db/schema";
import { findUser } from "@/lib/users";
import { fetchMeteora } from "@/lib/meteora-limiter";

const METEORA_API_BASE = "https://dlmm.datapi.meteora.ag";

export const dynamic = "force-dynamic";

const STALE_MINUTES = 30;

type Json = Record<string, unknown>;

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
    // Return from DB (already aggregated across user's wallets)
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

  // Fetch live from Meteora for all user wallets
  try {
    const wallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));

    if (wallets.length === 0) {
      return NextResponse.json({ positions: [] });
    }

    // Fetch open positions for all wallets in parallel
    const allPoolsList = await Promise.all(
      wallets.map(async (w) => {
        try {
          const url = `${METEORA_API_BASE}/portfolio/open?user=${w.address}`;
          const data = await fetchMeteora(url, 120000) as { pools?: Array<Json> };
          return data && Array.isArray(data.pools) ? data.pools : [];
        } catch {
          return [];
        }
      })
    );

    // Aggregate pools across wallets, merging by poolAddress
    const poolMap = new Map<string, Json>();
    
    for (const pools of allPoolsList) {
      for (const p of pools) {
        const poolAddress = p.poolAddress as string | undefined;
        if (!poolAddress) continue;

        const existing = poolMap.get(poolAddress);
        if (existing) {
          // Sum balances, unclaimedFees, and openPositionCount
          existing.balances = (parseFloat(String(existing.balances || 0)) + parseFloat(String(p.balances || 0))).toString();
          existing.unclaimedFees = (parseFloat(String(existing.unclaimedFees || 0)) + parseFloat(String(p.unclaimedFees || 0))).toString();
          existing.openPositionCount = (Number(existing.openPositionCount || 0) + Number(p.openPositionCount || 0));
        } else {
          // First occurrence of this pool
          poolMap.set(poolAddress, { ...p });
        }
      }
    }

    // Convert to response format, stripping wallet/owner fields
    const cleaned = Array.from(poolMap.values()).map((p) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { wallet, owner, ...rest } = p;
      const balances = parseFloat(String(rest.balances || 0));
      const unclaimedFees = parseFloat(String(rest.unclaimedFees || 0));
      return {
        poolAddress: rest.poolAddress,
        tokenX: rest.tokenX,
        tokenY: rest.tokenY,
        tokenXIcon: rest.tokenXIcon,
        tokenYIcon: rest.tokenYIcon,
        binStep: rest.binStep,
        protocol: rest.protocol,
        valueUsd: balances + unclaimedFees,
        positionCount: rest.openPositionCount,
      };
    });
    
    return NextResponse.json({ positions: cleaned });
  } catch (error) {
    console.error("Open positions fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch open positions" }, { status: 500 });
  }
}
