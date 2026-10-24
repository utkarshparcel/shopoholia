ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "real_price" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "affiliate_links" jsonb;
