export type DailyPnL = {
  date: string;
  pnl: number;
  positions: number;
};

export type Trader = {
  id: string;
  username: string;
  displayName: string;
  walletAddress?: string;
  xHandle?: string;
  xAvatarUrl?: string;
  thesis: string;
  portfolioValue: number;
  totalPnL: number;
  winRate: number;
  avgWin: number;
  biggestWin: number;
  avgLoss: number;
  pnlHistory: DailyPnL[];
};

export type MeteoraPortfolioTotal = {
  totalValue?: number;
  totalPnl?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  totalFees?: number;
  totalRewards?: number;
};

export type MeteoraEvent = {
  timestamp: number;
  type: string;
  amount?: number;
  pnl?: number;
};
