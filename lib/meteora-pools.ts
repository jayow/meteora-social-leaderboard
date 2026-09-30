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
 * Fetch ALL Meteora pools (DLMM) that have a given token as base (mint_x)
 * @param tokenMint - The base token mint address
 * @returns Array of enriched pool data
 */
export async function fetchMeteoraPoolsForToken(tokenMint: string): Promise<EnrichedPool[]> {
  try {
    // Try the pair search endpoint with mint - cached for 5 minutes
    const searchUrl = `https://dlmm-api.meteora.ag/pair/all_by_groups?search_term=${encodeURIComponent(tokenMint)}`;
    const searchData = await fetchMeteora<Record<string, MeteoraPool[]>>(searchUrl, 300000);

    const pools: EnrichedPool[] = [];

    if (searchData && typeof searchData === 'object') {
      // searchData is keyed by pair name, values are arrays of pools
      for (const [pairName, pairPools] of Object.entries(searchData)) {
        if (!Array.isArray(pairPools)) continue;

        for (const pool of pairPools) {
          // Only include pools where tokenMint is the base token (mint_x)
          if (pool.mint_x !== tokenMint || pool.hide) continue;

          const tvl = pool.reserve_x_amount && pool.reserve_y_amount && pool.current_price
            ? pool.reserve_x_amount * (pool.current_price || 1) + pool.reserve_y_amount
            : parseFloat(pool.liquidity || '0');

          // Extract token symbols from pair name (e.g. "SOL-USDC")
          const [tokenX, tokenY] = pairName.split('-');

          pools.push({
            poolAddress: pool.address,
            tokenX: tokenX || 'Unknown',
            tokenY: tokenY || 'Unknown',
            tokenXMint: pool.mint_x,
            tokenYMint: pool.mint_y,
            tokenXIcon: null, // API doesn't provide icons in search response
            tokenYIcon: null,
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
