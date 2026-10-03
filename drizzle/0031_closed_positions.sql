CREATE TABLE "closed_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"position_key" varchar(64) NOT NULL,
	"pool_address" varchar(64) NOT NULL,
	"token_x" text NOT NULL,
	"token_y" text NOT NULL,
	"token_x_mint" varchar(64),
	"token_y_mint" varchar(64),
	"token_x_icon" text,
	"token_y_icon" text,
	"bin_step" integer,
	"min_price" double precision,
	"max_price" double precision,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone NOT NULL,
	"capital_usd" double precision NOT NULL,
	"withdrawn_usd" double precision NOT NULL,
	"fees_usd" double precision NOT NULL,
	"pnl_usd" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "closed_backfill_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "closed_backfill_cursor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "closed_positions" ADD CONSTRAINT "closed_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "closed_positions_user_key" ON "closed_positions" USING btree ("user_id","position_key");--> statement-breakpoint
CREATE INDEX "closed_positions_user_closed_idx" ON "closed_positions" USING btree ("user_id","closed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "closed_positions_user_pool_idx" ON "closed_positions" USING btree ("user_id","pool_address");