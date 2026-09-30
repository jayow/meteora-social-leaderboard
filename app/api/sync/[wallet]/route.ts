import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { isValidWallet } from "@/lib/wallet";
import { findUser, toPublicSnapshot, upsertUser } from "@/lib/users";
import { getSnapshot, syncUser, todayUtc } from "@/lib/sync";

export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 5 * 60 * 1000;

async function handle(req: NextRequest, wallet: string): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  if (!isValidWallet(wallet)) return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });

  const existing = await findUser(wallet);
  const user = existing && existing.wallet === wallet ? existing : await upsertUser(wallet);

  const force = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}` && Boolean(process.env.CRON_SECRET);
  if (!force && user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < MIN_INTERVAL_MS) {
    const snap = await getSnapshot(user.id, todayUtc());
    if (snap) return NextResponse.json({ ok: true, cached: true, snapshot: toPublicSnapshot(snap) });
  }

  const result = await syncUser(user);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  const snap = await getSnapshot(user.id, result.date);
  return NextResponse.json({ ok: true, cached: false, snapshot: snap ? toPublicSnapshot(snap) : null });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ wallet: string }> }): Promise<NextResponse> {
  const { wallet } = await ctx.params;
  return handle(req, wallet);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ wallet: string }> }): Promise<NextResponse> {
  const { wallet } = await ctx.params;
  return handle(req, wallet);
}
