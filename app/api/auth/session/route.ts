import { NextResponse } from "next/server";
import { clearSession, getSessionWallet } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ wallet: await getSessionWallet() });
}

export async function DELETE(): Promise<NextResponse> {
  await clearSession();
  return NextResponse.json({ ok: true });
}
