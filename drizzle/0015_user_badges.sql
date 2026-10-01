-- Member badges (lib/badges). One row per member per badge; tiers only go up, rows are permanent.
-- Idempotent: safe to re-run (IF NOT EXISTS, guarded FK). Backfill: scripts/backfill-badges.ts.
CREATE TABLE IF NOT EXISTS "user_badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"badge" varchar(32) NOT NULL,
	"tier" integer DEFAULT 1 NOT NULL,
	"evidence" jsonb,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tier_earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_badges_user_id_users_id_fk') THEN
    ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$fk$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_badges_user_badge_key" ON "user_badges" USING btree ("user_id","badge");
