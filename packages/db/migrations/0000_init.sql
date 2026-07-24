CREATE TYPE "public"."avatar_status" AS ENUM('NONE', 'PROCESSING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."coin_ledger_type" AS ENUM('GRANT', 'IAP_PURCHASE', 'SPEND_ORDER', 'SPEND_UNLOCK', 'SPEND_RUSH', 'EARN_STREAK', 'EARN_SHARE', 'EARN_OPTIN', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('PENDING', 'PROCESSING', 'PACKED', 'OUT_FOR_DELIVERY', 'ARRIVING_SOON', 'DELIVERED', 'REVEAL_READY', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."order_tier" AS ENUM('EXPRESS', 'STANDARD', 'SLOW_BURN');--> statement-breakpoint
CREATE TYPE "public"."push_event_status" AS ENUM('QUEUED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."render_scenario" AS ENUM('STUDIO', 'GOLDEN_HOUR', 'STREET', 'EDITORIAL_DARK', 'NIGHT', 'CANDID');--> statement-breakpoint
CREATE TYPE "public"."render_status" AS ENUM('QUEUED', 'RUNNING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TABLE "avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reference_image_key" text,
	"source_upload_keys" text[] DEFAULT '{}' NOT NULL,
	"body_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "avatar_status" DEFAULT 'PROCESSING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatars_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"listing_variant_id" uuid NOT NULL,
	"coin_price_snapshot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "coin_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"type" "coin_ledger_type" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iap_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revenuecat_event_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"coins_granted" integer NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iap_receipts_revenuecat_event_id_unique" UNIQUE("revenuecat_event_id")
);
--> statement-breakpoint
CREATE TABLE "listing_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"size" text NOT NULL,
	"color" text NOT NULL,
	"garment_image_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"coin_price" integer NOT NULL,
	"product_image_keys" text[] DEFAULT '{}' NOT NULL,
	"house_model_render_key" text,
	"affiliate_url" text,
	"status" "listing_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"listing_variant_id" uuid NOT NULL,
	"coin_price_snapshot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" "order_tier" NOT NULL,
	"state" "order_state" DEFAULT 'PENDING' NOT NULL,
	"coin_total" integer NOT NULL,
	"placed_at" timestamp with time zone,
	"state_eta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reveal_ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"event_type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "push_event_status" DEFAULT 'QUEUED' NOT NULL,
	"expo_ticket_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"scenario" "render_scenario" NOT NULL,
	"image_key" text,
	"is_free" boolean DEFAULT false NOT NULL,
	"unlocked" boolean DEFAULT false NOT NULL,
	"provider" text NOT NULL,
	"status" "render_status" DEFAULT 'QUEUED' NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tryon_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"listing_variant_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"provider" text NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"display_name" text,
	"avatar_status" "avatar_status" DEFAULT 'NONE' NOT NULL,
	"coin_balance_cache" integer DEFAULT 0 NOT NULL,
	"consent_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"push_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_listing_variant_id_listing_variants_id_fk" FOREIGN KEY ("listing_variant_id") REFERENCES "public"."listing_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD CONSTRAINT "iap_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_variants" ADD CONSTRAINT "listing_variants_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_listing_variant_id_listing_variants_id_fk" FOREIGN KEY ("listing_variant_id") REFERENCES "public"."listing_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_events" ADD CONSTRAINT "push_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_events" ADD CONSTRAINT "push_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD CONSTRAINT "tryon_previews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD CONSTRAINT "tryon_previews_listing_variant_id_listing_variants_id_fk" FOREIGN KEY ("listing_variant_id") REFERENCES "public"."listing_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_events_dedupe_key_idx" ON "push_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tryon_previews_user_variant_idx" ON "tryon_previews" USING btree ("user_id","listing_variant_id");