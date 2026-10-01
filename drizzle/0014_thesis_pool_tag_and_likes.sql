-- Poolside: theses (token_comments) remember the author's pool, and members can like theses.
-- Idempotent: safe to re-run (IF NOT EXISTS, guarded FKs, backfill only touches untagged rows).
CREATE TABLE IF NOT EXISTS "thesis_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"comment_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_comments" ADD COLUMN IF NOT EXISTS "pool_address" varchar(64);--> statement-breakpoint
ALTER TABLE "token_comments" ADD COLUMN IF NOT EXISTS "pool_name" text;--> statement-breakpoint
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'thesis_likes_comment_id_token_comments_id_fk') THEN
    ALTER TABLE "thesis_likes" ADD CONSTRAINT "thesis_likes_comment_id_token_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."token_comments"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'thesis_likes_user_id_users_id_fk') THEN
    ALTER TABLE "thesis_likes" ADD CONSTRAINT "thesis_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$fk$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "thesis_likes_comment_user_key" ON "thesis_likes" USING btree ("comment_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "thesis_likes_user_idx" ON "thesis_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "token_comments_created_idx" ON "token_comments" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
-- Backfill: tag existing theses with the author's current position in a pool of that token (largest first).
UPDATE "token_comments" tc
SET "pool_address" = op."pool_address",
    "pool_name" = op."token_x" || '-' || op."token_y"
FROM (
  SELECT DISTINCT ON (o."user_id", o."token_x_mint") o."user_id", o."token_x_mint", o."pool_address", o."token_x", o."token_y"
  FROM "open_positions" o
  WHERE o."token_x_mint" IS NOT NULL
  ORDER BY o."user_id", o."token_x_mint", o."value_usd" DESC NULLS LAST, o."id"
) op
WHERE tc."pool_address" IS NULL AND op."user_id" = tc."user_id" AND op."token_x_mint" = tc."token_mint";
