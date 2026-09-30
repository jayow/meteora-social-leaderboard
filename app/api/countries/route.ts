import { NextResponse } from "next/server";
import { getPool, hasDb } from "@/lib/db";
import { countryName } from "@/lib/countries";

export const dynamic = "force-dynamic";

interface CountryRow {
  code: string;
  members: string;
}

export async function GET(): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ countries: [] });
  
  const pool = getPool();
  const { rows } = await pool.query<CountryRow>(
    `SELECT country as code, count(*)::text as members 
     FROM users 
     WHERE country IS NOT NULL AND joined_at IS NOT NULL 
     GROUP BY country 
     ORDER BY count(*) DESC`
  );

  const countries = rows.map((r) => ({
    code: r.code,
    name: countryName(r.code),
    members: Number(r.members),
  }));

  return NextResponse.json({ countries });
}
