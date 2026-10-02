CREATE TABLE "daily_stats" (
	"date" date PRIMARY KEY NOT NULL,
	"stats" jsonb NOT NULL,
	"sync_runs" integer DEFAULT 0 NOT NULL,
	"sync_synced" integer DEFAULT 0 NOT NULL,
	"sync_failed" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
