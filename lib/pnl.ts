import type { DailyPnL } from "./types";

export function formatUsd(n: number, signed = false): string {
  const sign = signed ? (n > 0 ? "+" : n < 0 ? "-" : "") : n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const body =
    abs >= 1000 ? `$${(abs / 1000).toFixed(abs >= 10000 ? 1 : 2)}K` : `$${abs.toFixed(2)}`;
  return `${sign}${body.replace("$-", "$")}`;
}

export function monthTotal(history: DailyPnL[], year: number, month: number): number {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return history.filter((d) => d.date.startsWith(prefix)).reduce((a, d) => a + d.pnl, 0);
}

export function makeHistory(days: number, seed: number): DailyPnL[] {
  const out: DailyPnL[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    if (rnd() < (weekend ? 0.55 : 0.2)) {
      out.push({ date, pnl: 0, positions: 0 });
      continue;
    }
    const win = rnd() > 0.35;
    const pnl = win ? rnd() * 1400 + 40 : -(rnd() * 700 + 25);
    out.push({
      date,
      pnl: Math.round(pnl * 100) / 100,
      positions: 1 + Math.floor(rnd() * 10),
    });
  }
  return out;
}
