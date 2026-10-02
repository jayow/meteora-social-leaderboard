ALTER TABLE "pnl_snapshots" ADD COLUMN "pnl_1d" double precision;--> statement-breakpoint
ALTER TABLE "pnl_snapshots" ADD COLUMN "volume_1d_usd" double precision;--> statement-breakpoint
ALTER TABLE "pnl_snapshots" ADD COLUMN "fees_1d_usd" double precision;--> statement-breakpoint
ALTER TABLE "pnl_snapshots" ADD COLUMN "win_rate_1d" double precision;