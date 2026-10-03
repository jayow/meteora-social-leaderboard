CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"link_url" text,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notifications_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notifications_muted" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "announcement_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_created_idx" ON "announcements" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
-- Launch: current members see the last 7 days as unread; older items show as read.
UPDATE "users" SET "notifications_seen_at" = now() - interval '7 days' WHERE "joined_at" IS NOT NULL;
