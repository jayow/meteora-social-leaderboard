import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
): Promise<NextResponse> {
  const { symbol } = await params;
  
  if (!hasDb()) {
    return NextResponse.json({ mint: null }, { status: 404 });
  }

  const pool = getPool();

  // Look up mint by symbol
  const { rows } = await pool.query<{ token_x_mint: string }>(
    `SELECT token_x_mint
     FROM open_positions
     WHERE token_x = $1 AND token_x_mint IS NOT NULL
     LIMIT 1`,
    [symbol.toUpperCase()]
  );

  if (rows.length > 0 && rows[0].token_x_mint) {
    return NextResponse.json({ mint: rows[0].token_x_mint });
  }

  return NextResponse.json({ mint: null }, { status: 404 });
}
