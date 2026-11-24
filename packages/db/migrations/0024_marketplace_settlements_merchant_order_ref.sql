-- Marketplace settlements move from API process memory to Postgres: one row per (kind, order_ref),
-- shared by the API and the workers. Purchase order refs become unique per merchant, so two
-- merchants' identical refs (Swiggy and Zomato order numbers) are two purchases. Rows that 0013
-- already marked DUPLICATE across merchants had order_ref cleared and are left as they are.
CREATE TABLE "marketplace_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"order_ref" text NOT NULL,
	"seller_id" text NOT NULL,
	"order_amount_minor" integer NOT NULL,
	"platform_fee_minor" integer NOT NULL,
	"gst_on_fee_minor" integer NOT NULL,
	"seller_payout_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "merchant_purchases_user_order_ref_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_settlements_kind_order_ref_uidx" ON "marketplace_settlements" USING btree ("kind","order_ref");--> statement-breakpoint
CREATE INDEX "marketplace_settlements_seller_idx" ON "marketplace_settlements" USING btree ("seller_id","completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_purchases_user_merchant_order_ref_idx" ON "merchant_purchases" USING btree ("user_id","merchant","order_ref") WHERE "merchant_purchases"."order_ref" IS NOT NULL;