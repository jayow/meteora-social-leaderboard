-- Activity feed events (see lib/activity.ts). Idempotent: safe to re-run; every statement is guarded and
-- the backfill uses ON CONFLICT ("dedupe_key") DO NOTHING. Stores no wallet addresses.
CREATE TABLE IF NOT EXISTS "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" integer NOT NULL,
	"kind" varchar(24) NOT NULL,
	"target_user_id" integer,
	"pool_address" varchar(64),
	"pool_name" text,
	"protocol" varchar(16),
	"bin_step" integer,
	"token_x_icon" text,
	"token_y_icon" text,
	"token_mint" varchar(64),
	"token_symbol" text,
	"comment_id" integer,
	"amount_usd" double precision,
	"dedupe_key" varchar(160) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_actor_user_id_users_id_fk') THEN
    ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_target_user_id_users_id_fk') THEN
    ALTER TABLE "activity" ADD CONSTRAINT "activity_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_comment_id_token_comments_id_fk') THEN
    ALTER TABLE "activity" ADD CONSTRAINT "activity_comment_id_token_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."token_comments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$fk$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_dedupe_key" ON "activity" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_occurred_idx" ON "activity" USING btree ("occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_actor_occurred_idx" ON "activity" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
-- Backfill: joined the beta.
INSERT INTO "activity" ("actor_user_id", "kind", "dedupe_key", "occurred_at")
SELECT u."id", 'joined', 'joined:' || u."id", u."joined_at"
FROM "users" u
WHERE u."joined_at" IS NOT NULL
ON CONFLICT ("dedupe_key") DO NOTHING;--> statement-breakpoint
-- Backfill: follows between joined members.
INSERT INTO "activity" ("actor_user_id", "kind", "target_user_id", "dedupe_key", "occurred_at")
SELECT f."follower_user_id", 'followed', f."followee_user_id",
       'followed:' || f."follower_user_id" || ':' || f."followee_user_id", f."created_at"
FROM "follows" f
JOIN "users" a ON a."id" = f."follower_user_id" AND a."joined_at" IS NOT NULL
JOIN "users" b ON b."id" = f."followee_user_id" AND b."joined_at" IS NOT NULL
ON CONFLICT ("dedupe_key") DO NOTHING;--> statement-breakpoint
-- Backfill: token theses (comments) that are still up.
INSERT INTO "activity" ("actor_user_id", "kind", "token_mint", "token_symbol", "comment_id", "dedupe_key", "occurred_at")
SELECT tc."user_id", 'thesis', tc."token_mint",
       (SELECT op."token_x" FROM "open_positions" op WHERE op."token_x_mint" = tc."token_mint" LIMIT 1),
       tc."id", 'thesis:' || tc."id", tc."created_at"
FROM "token_comments" tc
JOIN "users" u ON u."id" = tc."user_id" AND u."joined_at" IS NOT NULL
WHERE tc."deleted_at" IS NULL
ON CONFLICT ("dedupe_key") DO NOTHING;--> statement-breakpoint
-- Backfill: currently open positions (first seen at open_positions.created_at).
INSERT INTO "activity" ("actor_user_id", "kind", "pool_address", "pool_name", "protocol", "bin_step",
                        "token_x_icon", "token_y_icon", "token_mint", "token_symbol", "dedupe_key", "occurred_at")
SELECT op."user_id", 'opened', op."pool_address", op."token_x" || '-' || op."token_y", op."protocol", op."bin_step",
       op."token_x_icon", op."token_y_icon", op."token_x_mint", op."token_x", 'opened:' || op."id", op."created_at"
FROM "open_positions" op
JOIN "users" u ON u."id" = op."user_id" AND u."joined_at" IS NOT NULL
ON CONFLICT ("dedupe_key") DO NOTHING;
