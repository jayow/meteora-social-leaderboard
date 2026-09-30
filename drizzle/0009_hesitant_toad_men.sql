ALTER TABLE "open_positions" ADD COLUMN IF NOT EXISTS "token_x_mint" varchar(64);--> statement-breakpoint
ALTER TABLE "open_positions" ADD COLUMN IF NOT EXISTS "token_y_mint" varchar(64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "open_positions_token_x_mint_idx" ON "open_positions" USING btree ("token_x_mint");