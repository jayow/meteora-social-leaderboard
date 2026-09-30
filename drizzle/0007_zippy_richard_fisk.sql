CREATE TABLE "token_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_mint" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "token_comments" ADD CONSTRAINT "token_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_comments_mint_idx" ON "token_comments" USING btree ("token_mint","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "token_comments_user_idx" ON "token_comments" USING btree ("user_id","created_at" DESC NULLS LAST);