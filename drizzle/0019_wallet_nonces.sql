CREATE TABLE "wallet_nonces" (
	"nonce" varchar(64) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "wallet_nonces_expires_at_idx" ON "wallet_nonces" USING btree ("expires_at");