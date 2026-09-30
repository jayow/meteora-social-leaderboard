CREATE TABLE IF NOT EXISTS "user_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"address" varchar(64) NOT NULL,
	"label" text,
	"is_primary" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_wallets_address_key" ON "user_wallets" USING btree ("address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_wallets_user_id_idx" ON "user_wallets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_wallets_user_primary_idx" ON "user_wallets" USING btree ("user_id","is_primary");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_x_id_idx" ON "users" USING btree ("x_id");--> statement-breakpoint
-- Backfill user_wallets from existing users.wallet (as primary)
INSERT INTO "user_wallets" ("user_id", "address", "is_primary", "created_at")
SELECT "id", "wallet", 1, COALESCE("created_at", NOW())
FROM "users"
WHERE "wallet" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_wallets" WHERE "user_wallets"."address" = "users"."wallet"
  )
ON CONFLICT ("address") DO NOTHING;