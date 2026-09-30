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

interface MeteoraPoolsDatapiResponse {
  total: number;
  pages: number;
  current_page: number;
  page_size: number;
  data: MeteoraDatapiPool[];
}

interface MeteoraDatapiPool {
  address: string;
  name: string;
  token_x: { address: string; symbol: string };
  token_y: { address: string; symbol: string };
  token_x_amount: number;
  token_y_amount: number;
  pool_config: { bin_step: number };
  tvl: number;
  current_price?: number;
  dynamic_fee_24h?: number;
  volume_24h?: number;
  apr?: number;
  hide?: boolean;
}

/**
 * Fetch ALL Meteora pools (DLMM) that have a given token as base (mint_x)
 * @param tokenMint - The base token mint address
 * @returns Array of enriched pool data
 */
export async function fetchMeteoraPoolsForToken(tokenMint: string): Promise<EnrichedPool[]> {
  try {
    // Use datapi pools endpoint filtered by mint - cached for 5 minutes
    const poolsUrl = `https://dlmm.datapi.meteora.ag/pools?mint=${encodeURIComponent(tokenMint)}&page_size=100`;
    const response = await fetchMeteora<MeteoraPoolsDatapiResponse>(poolsUrl, 300000);

    const pools: EnrichedPool[] = [];

    if (response?.data && Array.isArray(response.data)) {
      for (const pool of response.data) {
        // Only include pools where tokenMint is the base token (token_x)
        if (pool.token_x.address !== tokenMint || pool.hide) continue;

        pools.push({
          poolAddress: pool.address,
          tokenX: pool.token_x.symbol,
          tokenY: pool.token_y.symbol,
          tokenXMint: pool.token_x.address,
          tokenYMint: pool.token_y.address,
          tokenXIcon: null,
          tokenYIcon: null,
          binStep: pool.pool_config.bin_step,
          protocol: "dlmm",
          tvl: pool.tvl,
          volume24h: pool.volume_24h || null,
          fees24h: pool.dynamic_fee_24h || null,
          apr: pool.apr || null,
          memberCount: 0,
        });
      }
    }

    return pools;
  } catch (error) {
    console.error("Error fetching Meteora pools:", error);
    return [];
  }
}
