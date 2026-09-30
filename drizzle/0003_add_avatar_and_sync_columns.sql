ALTER TABLE "users" ADD COLUMN "avatar_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_attempted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_last_attempted_at_idx" ON "users" USING btree ("last_attempted_at");