import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { countTheses, listTheses } from "@/lib/theses";

export const dynamic = "force-dynamic";

/** A member's public theses (newest 10) plus their total, from the same source as Poolside. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  if (!hasDb()) return NextResponse.json({ theses: [], total: 0 });

  const viewerId = await getSessionUserId();
  const [posts, total] = await Promise.all([listTheses({ authorId: userId, viewerId, limit: 10 }), countTheses({ authorId: userId })]);

  // Legacy fields (tokenMint/tokenSymbol/tokenIcon) kept for older callers.
  const theses = posts.map((p) => ({
    ...p,
    tokenMint: p.token.mint,
    tokenSymbol: p.token.symbol ?? "?",
    tokenIcon: p.token.icon,
  }));

  return NextResponse.json({ theses, total }, { headers: { "Cache-Control": "private, no-store" } });
}
