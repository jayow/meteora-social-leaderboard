import { NextRequest, NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/session";
import { redeemCode } from "@/lib/invite";
import { toPublicUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const wallet = await getSessionWallet();
  if (!wallet) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: { code?: string; country?: string | null; thesis?: string | null } = {};
  try {
    body = (await req.json()) as { code?: string; country?: string | null; thesis?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { code, country, thesis } = body;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  const result = await redeemCode(wallet, code.trim(), country, thesis);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, user: toPublicUser(result.user!, true) }, { status: 200 });
}
