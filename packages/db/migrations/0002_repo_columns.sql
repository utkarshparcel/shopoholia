ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_idx" ON "orders" ("idempotency_key");--> statement-breakpoint
ALTER TABLE "tryon_previews" ALTER COLUMN "image_key" DROP NOT NULL;
