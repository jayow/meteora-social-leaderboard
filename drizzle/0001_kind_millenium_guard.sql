CREATE TABLE "follows" (
	"id" serial PRIMARY KEY NOT NULL,
	"follower_user_id" integer NOT NULL,
	"followee_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"pool_address" varchar(64) NOT NULL,
	"token_x" text NOT NULL,
	"token_y" text NOT NULL,
	"token_x_icon" text,
	"token_y_icon" text,
	"bin_step" integer,
	"protocol" varchar(16),
	"value_usd" double precision,
	"position_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_user_id_users_id_fk" FOREIGN KEY ("followee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_positions" ADD CONSTRAINT "open_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "follows_follower_followee_key" ON "follows" USING btree ("follower_user_id","followee_user_id");--> statement-breakpoint
CREATE INDEX "follows_follower_idx" ON "follows" USING btree ("follower_user_id");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "open_positions_user_pool_key" ON "open_positions" USING btree ("user_id","pool_address");--> statement-breakpoint
CREATE INDEX "open_positions_pool_idx" ON "open_positions" USING btree ("pool_address");--> statement-breakpoint
CREATE INDEX "open_positions_user_idx" ON "open_positions" USING btree ("user_id");