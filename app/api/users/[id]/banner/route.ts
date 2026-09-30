import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, hasDb } from "@/lib/db";
import { profileBanners, users } from "@/lib/db/schema";
import { findUser } from "@/lib/users";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// GET /api/users/[id]/banner?v=timestamp - serve banner image
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !user.joinedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();
  const [banner] = await db.select().from(profileBanners).where(eq(profileBanners.userId, user.id)).limit(1);
  
  if (!banner) {
    return NextResponse.json({ error: "No banner" }, { status: 404 });
  }

  // Decode base64 data
  const buffer = Buffer.from(banner.data, "base64");
  
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": banner.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// POST /api/users/[id]/banner - upload banner
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !user.joinedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.id !== sessionUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: check if uploaded in last hour
  const db = getDb();
  const [existing] = await db.select().from(profileBanners).where(eq(profileBanners.userId, user.id)).limit(1);
  if (existing) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (existing.updatedAt > hourAgo) {
      return NextResponse.json({ error: "Rate limit: wait 1 hour between uploads" }, { status: 429 });
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("banner") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPG, PNG, or WebP" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Max 5MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Process image: crop to 3:1 aspect ratio and resize to 1500x500 WebP
    const processed = await sharp(buffer)
      .resize(1500, 500, { fit: "cover", position: "center" })
      .webp({ quality: 85 })
      .toBuffer();

    const base64Data = processed.toString("base64");
    const mime = "image/webp";

    // Upsert banner
    await db
      .insert(profileBanners)
      .values({
        userId: user.id,
        mime,
        data: base64Data,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: profileBanners.userId,
        set: { mime, data: base64Data, updatedAt: new Date() },
      });

    // Update banner_updated_at timestamp
    await db
      .update(users)
      .set({ bannerUpdatedAt: new Date() })
      .where(eq(users.id, user.id));

    return NextResponse.json({ ok: true, version: Date.now() });
  } catch (error) {
    console.error("Banner upload error:", error);
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 });
  }
}

// DELETE /api/users/[id]/banner - remove banner
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!hasDb()) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const user = await findUser(decodeURIComponent(id));
  
  if (!user || !user.joinedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.id !== sessionUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  await db.delete(profileBanners).where(eq(profileBanners.userId, user.id));
  await db.update(users).set({ bannerUpdatedAt: null }).where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
