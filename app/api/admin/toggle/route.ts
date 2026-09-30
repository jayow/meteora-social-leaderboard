import { NextRequest, NextResponse } from "next/server";
import { getSessionWallet } from "@/lib/session";
import { isAdmin, disableCode, enableCode } from "@/lib/invite";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const wallet = await getSessionWallet();
  if (!isAdmin(wallet)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: { codeId?: number; disabled?: boolean } = {};
  try {
    body = (await req.json()) as { codeId?: number; disabled?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { codeId, disabled } = body;
  if (!Number.isInteger(codeId) || typeof codeId !== "number") {
    return NextResponse.json({ error: "Missing codeId" }, { status: 400 });
  }
  if (disabled) {
    await disableCode(codeId);
  } else {
    await enableCode(codeId);
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
