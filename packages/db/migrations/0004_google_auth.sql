ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_sub" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_sub_idx" ON "users" ("google_sub");
