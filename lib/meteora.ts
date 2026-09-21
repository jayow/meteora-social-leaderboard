export type DailyPnL = { date: string; pnl: number; positions: number };

export function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Map open-portfolio event types into a signed USD contribution for the calendar. */
export function eventUsd(event: {
  eventType?: string;
  totalUsd?: string | number;
}): number {
  const amount = num(event.totalUsd);
  const t = (event.eventType || "").toLowerCase();
  if (t.includes("claim")) return Math.abs(amount);
  if (t.includes("add") || t.includes("deposit")) return 0; // capital in, not PnL
  if (t.includes("remove") || t.includes("withdraw")) return 0; // capital out
  return amount;
}

export function aggregateEventsByDay(
  events: Array<{ blockTime?: number; createdAt?: string; eventType?: string; totalUsd?: string | number }>
): DailyPnL[] {
  const map = new Map<string, { pnl: number; positions: number }>();
  for (const event of events) {
    let date = "";
    if (event.createdAt) date = event.createdAt.slice(0, 10);
    else if (event.blockTime) date = new Date(event.blockTime).toISOString().slice(0, 10);
    if (!date) continue;
    const pnl = eventUsd(event);
    const cur = map.get(date) || { pnl: 0, positions: 0 };
    map.set(date, { pnl: cur.pnl + pnl, positions: cur.positions + 1 });
  }
  return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
}
