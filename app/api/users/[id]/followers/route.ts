import type { NextRequest, NextResponse } from "next/server";
import { followListResponse } from "@/lib/follow-list-route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return followListResponse(req, ctx, "followers");
}
