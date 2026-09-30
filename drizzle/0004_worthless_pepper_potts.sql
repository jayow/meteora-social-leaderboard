CREATE TABLE IF NOT EXISTS "invite_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(8) NOT NULL,
	"created_by_user_id" integer,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"disabled" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invited_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invite_code_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "member_number" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invite_codes_code_key" ON "invite_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_codes_created_by_idx" ON "invite_codes" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_member_number_key" ON "users" USING btree ("member_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_joined_at_idx" ON "users" USING btree ("joined_at");--> statement-breakpoint
-- Backfill existing users: set joined_at = created_at and member_number by created_at order
UPDATE "users" 
SET 
  "joined_at" = "created_at",
  "member_number" = subq.row_num
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at" ASC) AS row_num
  FROM "users"
  WHERE "joined_at" IS NULL
) AS subq
WHERE "users"."id" = subq."id";