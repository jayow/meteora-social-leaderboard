import { NextRequest, NextResponse } from "next/server";
import { validateCode } from "@/lib/invite";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { code?: string } = {};
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { code } = body;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  const result = await validateCode(code.trim());
  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason }, { status: 200 });
  }
  return NextResponse.json({ valid: true }, { status: 200 });
}
