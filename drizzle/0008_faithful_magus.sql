ALTER TABLE "users" ADD COLUMN "signup_method" varchar(16);--> statement-breakpoint
UPDATE "users" SET "signup_method" = CASE
  WHEN "x_id" IS NOT NULL AND "x_handle" IS NOT NULL THEN 'x'
  ELSE 'wallet'
END WHERE "signup_method" IS NULL;