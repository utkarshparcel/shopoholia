ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referred_by" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streak_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_streak_claim_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "style_profile" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_idx" ON "users" ("referral_code");--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "cashback_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TYPE "coin_ledger_type" ADD VALUE IF NOT EXISTS 'EARN_REFERRAL';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "coin_ledger_type" ADD VALUE IF NOT EXISTS 'EARN_CASHBACK';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cashback_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "listing_id" uuid REFERENCES "listings"("id") ON DELETE SET NULL,
  "platform" text NOT NULL,
  "click_id" text NOT NULL,
  "coins_earned" integer DEFAULT 0 NOT NULL,
  "status" "cashback_status" DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cashback_events_click_id_idx" ON "cashback_events" ("click_id");