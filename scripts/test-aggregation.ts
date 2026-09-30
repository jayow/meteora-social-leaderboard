/**
 * Test script to verify multi-wallet aggregation logic
 * Tests that stats are correctly summed across multiple wallets
 */

interface WalletPerformance {
  wallet: string;
  totalPnl: number;
  pnl30d: number;
  fees: number;
  volume: number;
  openPositions: number;
  closedPositions: number;
  winCount: number;
  lossCount: number;
}

function aggregateWallets(wallets: WalletPerformance[]): {
  totalPnl: number;
  pnl30d: number;
  fees: number;
  volume: number;
  openPositions: number;
  closedPositions: number;
  winRate: number;
} {
  let totalPnl = 0;
  let pnl30d = 0;
  let fees = 0;
  let volume = 0;
  let openPositions = 0;
  let closedPositions = 0;
  let totalWins = 0;
  let totalLosses = 0;

  for (const w of wallets) {
    totalPnl += w.totalPnl;
    pnl30d += w.pnl30d;
    fees += w.fees;
    volume += w.volume;
    openPositions += w.openPositions;
    closedPositions += w.closedPositions;
    totalWins += w.winCount;
    totalLosses += w.lossCount;
  }

  const totalTrades = totalWins + totalLosses;
  const winRate = totalTrades > 0 ? totalWins / totalTrades : 0;

  return {
    totalPnl,
    pnl30d,
    fees,
    volume,
    openPositions,
    closedPositions,
    winRate,
  };
}

// Test case: Two wallets with different performance
const testWallets: WalletPerformance[] = [
  {
    wallet: "Wallet1",
    totalPnl: 1000,
    pnl30d: 500,
    fees: 50,
    volume: 10000,
    openPositions: 2,
    closedPositions: 100,
    winCount: 60, // 60% win rate
    lossCount: 40,
  },
  {
    wallet: "Wallet2",
    totalPnl: 2000,
    pnl30d: 800,
    fees: 75,
    volume: 15000,
    openPositions: 3,
    closedPositions: 150,
    winCount: 75, // 50% win rate
    lossCount: 75,
  },
];

const result = aggregateWallets(testWallets);

console.log("Multi-wallet aggregation test:");
console.log("==============================");
console.log("\nInput wallets:");
testWallets.forEach((w) => {
  console.log(
    `  ${w.wallet}: PnL=${w.totalPnl}, Closed=${w.closedPositions}, WinRate=${((w.winCount / (w.winCount + w.lossCount)) * 100).toFixed(1)}%`
  );
});

console.log("\nExpected aggregated results:");
console.log("  Total PnL: 3000 (1000 + 2000)");
console.log("  30D PnL: 1300 (500 + 800)");
console.log("  Fees: 125 (50 + 75)");
console.log("  Volume: 25000 (10000 + 15000)");
console.log("  Open positions: 5 (2 + 3)");
console.log("  Closed positions: 250 (100 + 150)");
console.log("  Win rate: 54% (135 wins / 250 total trades) - NOT an average of 60% and 50%");

console.log("\nActual aggregated results:");
console.log(`  Total PnL: ${result.totalPnl}`);
console.log(`  30D PnL: ${result.pnl30d}`);
console.log(`  Fees: ${result.fees}`);
console.log(`  Volume: ${result.volume}`);
console.log(`  Open positions: ${result.openPositions}`);
console.log(`  Closed positions: ${result.closedPositions}`);
console.log(`  Win rate: ${(result.winRate * 100).toFixed(1)}%`);

const passed =
  result.totalPnl === 3000 &&
  result.pnl30d === 1300 &&
  result.fees === 125 &&
  result.volume === 25000 &&
  result.openPositions === 5 &&
  result.closedPositions === 250 &&
  Math.abs(result.winRate - 0.54) < 0.001;

console.log(`\n${passed ? "✅ TEST PASSED" : "❌ TEST FAILED"}`);

if (!passed) {
  process.exit(1);
}
