-- Opt-in position sharing on Poolside (off by default for new and existing users); idempotent.
-- 0016 is the Terms lane's consent columns; this one is independent of it.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "share_position_activity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "share_position_activity_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position_sharing_asked_at" timestamp with time zone;
