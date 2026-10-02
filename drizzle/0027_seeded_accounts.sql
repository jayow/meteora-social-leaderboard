ALTER TABLE "users" ADD COLUMN "seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Record existing seed rows: the seed convention marks them sync-protected with a future last_attempted_at.
UPDATE "users" SET "seeded" = true WHERE "last_attempted_at" > now();
