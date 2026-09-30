ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_attempted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_last_attempted_at_idx" ON "users" USING btree ("last_attempted_at");