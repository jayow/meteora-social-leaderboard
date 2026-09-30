CREATE TABLE "pnl_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"total_pnl_usd" double precision,
	"pnl_7d" double precision,
	"pnl_30d" double precision,
	"volume_usd" double precision,
	"volume_7d_usd" double precision,
	"volume_30d_usd" double precision,
	"fees_usd" double precision,
	"fees_30d_usd" double precision,
	"win_rate" double precision,
	"win_rate_7d" double precision,
	"win_rate_30d" double precision,
	"positions_open" integer,
	"positions_closed" integer,
	"portfolio_value_usd" double precision,
	"top_pool_address" varchar(64),
	"top_pool_name" text,
	"top_pool_bin_step" integer,
	"top_pool_protocol" varchar(16),
	"top_pool_x_icon" text,
	"top_pool_y_icon" text,
	"source" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet" varchar(64) NOT NULL,
	"x_id" varchar(64),
	"x_handle" varchar(64),
	"x_name" text,
	"x_avatar_url" text,
	"country" varchar(2),
	"thesis" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pnl_snapshots" ADD CONSTRAINT "pnl_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pnl_snapshots_user_date_key" ON "pnl_snapshots" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "pnl_snapshots_date_idx" ON "pnl_snapshots" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_wallet_key" ON "users" USING btree ("wallet");--> statement-breakpoint
CREATE INDEX "users_x_handle_idx" ON "users" USING btree ("x_handle");