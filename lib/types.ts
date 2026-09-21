export type DailyPnL = {
  date: string;
  pnl: number;
  positions: number;
};

export type Trader = {
  id: string;
  username: string;
  displayName: string;
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
