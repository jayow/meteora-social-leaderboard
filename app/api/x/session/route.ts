import { NextResponse } from "next/server";
import { consumeXProfileCookie } from "@/lib/x-oauth";

export async function GET(): Promise<NextResponse> {
  const profile = await consumeXProfileCookie();

  if (!profile) {
    return NextResponse.json({ profile: null }, { status: 200 });
  }

  return NextResponse.json({ profile }, { status: 200 });
}
