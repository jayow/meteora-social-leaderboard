CREATE TABLE IF NOT EXISTS "profile_banners" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"mime" varchar(32) NOT NULL,
	"data" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banner_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profile_banners" ADD CONSTRAINT "profile_banners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;