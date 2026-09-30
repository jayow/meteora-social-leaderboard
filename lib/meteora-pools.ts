import { fetchMeteora } from "@/lib/meteora-limiter";

interface MeteoraPoolToken {
  address: string;
  symbol: string;
  logoURI?: string;
}

interface MeteoraPool {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  reserve_x: string;
  reserve_y: string;
  reserve_x_amount: number;
  reserve_y_amount: number;
  bin_step: number;
  base_fee_percentage: string;
  max_fee_percentage?: string;
  protocol_fee_percentage?: string;
  liquidity: string;
  reward_mint_x?: string;
  reward_mint_y?: string;
  fees_24h?: number;
  today_fees?: number;
  trade_volume_24h?: number;
  cumulative_trade_volume?: string;
  cumulative_fee_volume?: string;
  current_price?: number;
  apr?: number;
  apy?: number;
  farm_apr?: number;
  farm_apy?: number;
  hide?: boolean;
}

interface MeteoraPoolsResponse {
  groups?: Array<{
    tokens?: [MeteoraPoolToken, MeteoraPoolToken];
    pools?: MeteoraPool[];
  }>;
}

export interface EnrichedPool {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string;
  tokenYMint: string;
  tokenXIcon: string | null;
  tokenYIcon: string | null;
  binStep: number | null;
  protocol: string;
  tvl: number | null;
  volume24h: number | null;
  fees24h: number | null;
  apr: number | null;
  memberCount: number;
}

/**
 * Fetch ALL Meteora pools (DLMM and DAMM v2) that have a given token as base (mint_x)
 * @param tokenMint - The base token mint address
 * @returns Array of enriched pool data
 */
export async function fetchMeteoraPoolsForToken(tokenMint: string): Promise<EnrichedPool[]> {
  try {
    // Fetch DLMM pools - cached for 5 minutes
    const dlmmData = await fetchMeteora<MeteoraPoolsResponse>(
      "https://dlmm.datapi.meteora.ag/pools",
      300000
    );

    const pools: EnrichedPool[] = [];

    if (dlmmData?.groups) {
      for (const group of dlmmData.groups) {
        if (!group.tokens || group.tokens.length !== 2 || !group.pools) continue;

        const [tokenXInfo, tokenYInfo] = group.tokens;
        
        // Only include pools where tokenMint is the base token (mint_x)
        if (tokenXInfo.address !== tokenMint) continue;

        for (const pool of group.pools) {
          if (pool.hide) continue;

          const tvl = pool.reserve_x_amount && pool.reserve_y_amount && pool.current_price
            ? pool.reserve_x_amount * (pool.current_price || 1) + pool.reserve_y_amount
            : null;

          pools.push({
            poolAddress: pool.address,
            tokenX: tokenXInfo.symbol,
            tokenY: tokenYInfo.symbol,
            tokenXMint: pool.mint_x,
            tokenYMint: pool.mint_y,
            tokenXIcon: tokenXInfo.logoURI || null,
            tokenYIcon: tokenYInfo.logoURI || null,
            binStep: pool.bin_step,
            protocol: "dlmm",
            tvl,
            volume24h: pool.trade_volume_24h || null,
            fees24h: pool.fees_24h || pool.today_fees || null,
            apr: pool.apr || null,
            memberCount: 0, // Will be joined from open_positions
          });
        }
      }
    }

    return pools;
  } catch (error) {
    console.error("Error fetching Meteora pools:", error);
    return [];
  }
}
