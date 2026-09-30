import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ThesisRow {
  id: number;
  token_mint: string;
  body: string;
  created_at: string;
  token_symbol: string;
  token_icon: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  
  if (!hasDb()) return NextResponse.json({ theses: [] });

  const pool = getPool();

  // Get user's recent token comments with token info
  const query = `
    SELECT 
      tc.id,
      tc.token_mint,
      tc.body,
      tc.created_at,
      op.token_x AS token_symbol,
      op.token_x_icon AS token_icon
    FROM token_comments tc
    JOIN open_positions op ON op.token_x_mint = tc.token_mint AND op.user_id = tc.user_id
    WHERE tc.user_id = $1 AND tc.deleted_at IS NULL
    GROUP BY tc.id, tc.token_mint, tc.body, tc.created_at, op.token_x, op.token_x_icon
    ORDER BY tc.created_at DESC
    LIMIT 10
  `;

  const { rows } = await pool.query<ThesisRow>(query, [Number(id)]);

  const theses = rows.map((r) => ({
    id: r.id,
    tokenMint: r.token_mint,
    body: r.body,
    createdAt: r.created_at,
    tokenSymbol: r.token_symbol,
    tokenIcon: r.token_icon,
  }));

  return NextResponse.json({ theses });
}
