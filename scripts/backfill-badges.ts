/**
 * Backfill / recompute badges for existing members. Idempotent: badges only get added or upgraded.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-badges.ts [--no-fetch] [--user=ID] [--dry-run]
 *
 * - Metric badges from stored data (latest snapshot + pools we've seen), the same computation the
 *   sync uses (lib/badges/compute.ts). Members only.
 * - Pool Hopper: unless --no-fetch, also reads each member's Meteora portfolio pool count (one public,
 *   read-only request per wallet) for members the hourly cron syncs; snapshots written before the
 *   badges release don't carry that count yet. Nothing is written except user_badges.
 * - Podium from the current 30D leaderboard ranks.
 * - Silent: no Poolside events (the backfill would otherwise flood the feed).
 * Prints user ids and badge counts only, never wallets.
 */
import { getDb, getPool } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { num } from "@/lib/meteora";
import { fetchMeteora } from "@/lib/meteora-limiter";
import { meteoraUrls } from "@/lib/meteora-endpoints";
import { getUserWalletAddresses } from "@/lib/users";
import { awardBadges, evaluateBadges, evaluatePodium, metricsFromDb } from "@/lib/badges/compute";
import { BADGE_IDS } from "@/lib/badges/config";

const args = process.argv.slice(2);
const fetchPools = !args.includes("--no-fetch");
const dryRun = args.includes("--dry-run");
const onlyUser = Number(args.find((a) => a.startsWith("--user="))?.split("=")[1]) || null;

async function meteoraPoolCount(wallets: string[]): Promise<number> {
  const seen = new Set<string>();
  let maxTotal = 0;
  for (const w of wallets) {
    try {
      const d = await fetchMeteora<Record<string, unknown>>(meteoraUrls.portfolio(w, 100), 600_000);
      maxTotal = Math.max(maxTotal, Math.round(num(d?.totalCount)));
      const pools = Array.isArray(d?.pools) ? (d.pools as Array<{ poolAddress?: unknown }>) : [];
      for (const p of pools) if (typeof p.poolAddress === "string") seen.add(p.poolAddress);
    } catch {
      // No data for this wallet: fall back to what we have stored.
    }
  }
  return Math.max(maxTotal, seen.size);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const db = getDb();
  const members = await db
    .select({ id: users.id, wallet: users.wallet, lastAttemptedAt: users.lastAttemptedAt })
    .from(users)
    .where(onlyUser ? sql`${users.joinedAt} IS NOT NULL AND ${users.id} = ${onlyUser}` : sql`${users.joinedAt} IS NOT NULL`)
    .orderBy(users.id);

  console.log(`[badges] ${members.length} member(s); fetch pools: ${fetchPools}; dry run: ${dryRun}`);
  let changed = 0;
  for (const m of members) {
    const metrics = await metricsFromDb(m.id);
    // Only members the cron actually syncs (skips sync-protected rows such as local seed data).
    const synced = !m.lastAttemptedAt || m.lastAttemptedAt.getTime() <= Date.now();
    if (fetchPools && synced) {
      const fetched = await meteoraPoolCount(await getUserWalletAddresses(m));
      metrics.distinctPools = Math.max(metrics.distinctPools ?? 0, fetched) || null;
    }
    const awards = evaluateBadges(metrics);
    if (dryRun) {
      console.log(`[badges] user ${m.id}: ${awards.map((a) => `${a.badge}:${a.tier}`).join(", ") || "none"}`);
      continue;
    }
    const res = await awardBadges(m.id, awards, { announce: false });
    changed += res.length;
    if (res.length) console.log(`[badges] user ${m.id}: +${res.map((a) => `${a.badge}:${a.tier}`).join(", ")}`);
  }

  if (!dryRun) {
    const podium = await evaluatePodium({ announce: false });
    changed += podium.awarded.length;
    console.log(`[badges] podium: ${podium.checked} member(s) in a 30D top 3, ${podium.awarded.length} new/upgraded`);
  }

  const { rows } = await getPool().query<{ badge: string; tier: number; n: number }>(
    `SELECT b.badge, b.tier, count(*)::int AS n FROM user_badges b JOIN users u ON u.id = b.user_id AND u.joined_at IS NOT NULL
     GROUP BY 1, 2 ORDER BY 1, 2`
  );
  console.log(`[badges] ${changed} badge(s) added or upgraded this run. Totals (members):`);
  for (const id of BADGE_IDS) {
    const r = rows.filter((x) => x.badge === id);
    const total = r.reduce((s, x) => s + x.n, 0);
    console.log(`  ${id.padEnd(13)} ${String(total).padStart(3)}  ${r.map((x) => `t${x.tier}=${x.n}`).join(" ")}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error("[badges] backfill failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void getPool().end();
  });
