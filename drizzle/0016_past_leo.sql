-- Terms consent fields; idempotent for local and deploy restores.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_version_accepted" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp with time zone;