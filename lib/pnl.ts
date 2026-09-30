import type { DailyPnL } from "./types";

export function formatUsd(n: number, signed = false): string {
  const sign = signed ? (n > 0 ? "+" : n < 0 ? "-" : "") : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const body = abs >= 1000 ? `$${(abs / 1000).toFixed(abs >= 10000 ? 1 : 2)}K` : `$${abs.toFixed(abs >= 100 ? 0 : 2)}`;
  return `${sign}${body}`;
}

export function monthTotal(history: DailyPnL[], year: number, month: number): number {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return history.filter((d) => d.date.startsWith(prefix)).reduce((a, d) => a + d.pnl, 0);
}
