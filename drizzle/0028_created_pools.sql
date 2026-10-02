CREATE TABLE "created_pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"pool_address" varchar(64) NOT NULL,
	"pool_created_at" timestamp with time zone,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_pools_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "created_pools" ADD CONSTRAINT "created_pools_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "created_pools_user_pool_key" ON "created_pools" USING btree ("user_id","pool_address");--> statement-breakpoint
CREATE INDEX "created_pools_user_created_idx" ON "created_pools" USING btree ("user_id","pool_created_at");