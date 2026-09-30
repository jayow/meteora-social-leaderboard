CREATE INDEX "pnl_snapshots_user_date_desc_idx" ON "pnl_snapshots" USING btree ("user_id","date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_country_idx" ON "users" USING btree ("country");--> statement-breakpoint
CREATE INDEX "users_last_synced_at_idx" ON "users" USING btree ("last_synced_at");