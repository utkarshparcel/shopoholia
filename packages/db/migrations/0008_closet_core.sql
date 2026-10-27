CREATE TYPE "public"."closet_profile_kind" AS ENUM('SELF', 'PARTNER', 'KID', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."closet_status" AS ENUM('ACTIVE', 'STORED');--> statement-breakpoint
CREATE TYPE "public"."disposition_mode" AS ENUM('SELL', 'DONATE', 'BARTER');--> statement-breakpoint
CREATE TYPE "public"."disposition_status" AS ENUM('ACTIVE', 'SOLD', 'DONATED', 'BARTERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."garment_type" AS ENUM('BLOUSE', 'KURTI', 'SUIT', 'SAREE', 'LEHENGA', 'SHIRT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."gift_occasion" AS ENUM('BIRTHDAY', 'ANNIVERSARY', 'FESTIVAL', 'HOUSEWARMING', 'GRADUATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."gift_order_status" AS ENUM('PLANNED', 'ORDERED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."household_role" AS ENUM('OWNER', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."item_metric_status" AS ENUM('ACTIVE', 'DORMANT', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."laundry_status" AS ENUM('CLEAN', 'DIRTY', 'IN_LAUNDRY');--> statement-breakpoint
CREATE TYPE "public"."outfit_occasion" AS ENUM('CASUAL', 'WORK', 'FORMAL', 'PARTY', 'SPORT', 'TRAVEL');--> statement-breakpoint
CREATE TYPE "public"."recipient_relationship" AS ENUM('FAMILY', 'FRIEND', 'PARTNER', 'COLLEAGUE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."seller_type" AS ENUM('RETAILER', 'TAILOR', 'INDIVIDUAL');--> statement-breakpoint
CREATE TYPE "public"."swap_circle_role" AS ENUM('OWNER', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."swap_listing_status" AS ENUM('LISTED', 'BORROWED', 'RETURNED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."tailor_order_state" AS ENUM('PENDING', 'CONFIRMED', 'IN_STITCHING', 'SHIPPED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."wardrobe_source" AS ENUM('MANUAL', 'RECEIPT', 'EMAIL', 'SMS');--> statement-breakpoint
CREATE TABLE "disposition_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"mode" "disposition_mode" DEFAULT 'SELL' NOT NULL,
	"price_minor" integer,
	"status" "disposition_status" DEFAULT 'ACTIVE' NOT NULL,
	"seller_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"wear_count" integer DEFAULT 0 NOT NULL,
	"last_worn_at" timestamp with time zone,
	"cost_per_wear_minor" integer,
	"target_cpw_minor" integer,
	"status" "item_metric_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_metrics_wardrobe_item_id_unique" UNIQUE("wardrobe_item_id")
);
--> statement-breakpoint
CREATE TABLE "outfits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_ids" uuid[] DEFAULT '{}' NOT NULL,
	"occasion" "outfit_occasion",
	"weather_ctx" jsonb DEFAULT 'null'::jsonb,
	"planned_for" date,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"style_profile_snapshot" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"repaired_on" date NOT NULL,
	"kind" text DEFAULT 'REPAIR' NOT NULL,
	"note" text,
	"tailor_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wardrobe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "wardrobe_source" DEFAULT 'MANUAL' NOT NULL,
	"category" text NOT NULL,
	"colors" text[] DEFAULT '{}' NOT NULL,
	"brand" text,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"image_keys" text[] DEFAULT '{}' NOT NULL,
	"garment_image_key" text,
	"purchase_item_id" uuid,
	"laundry_status" "laundry_status" DEFAULT 'CLEAN' NOT NULL,
	"closet_status" "closet_status" DEFAULT 'ACTIVE' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"care_rules" jsonb DEFAULT 'null'::jsonb,
	"dry_clean_ticket" text,
	"dry_clean_pickup_on" date,
	"lent_to" text,
	"lent_due_on" date,
	"profile_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wear_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wardrobe_item_id" uuid,
	"outfit_id" uuid,
	"worn_on" timestamp with time zone DEFAULT now() NOT NULL,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closet_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"household_id" uuid,
	"name" text NOT NULL,
	"kind" "closet_profile_kind" DEFAULT 'KID' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "household_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swap_circle_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "swap_circle_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swap_circles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swap_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"circle_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"disposition_listing_id" uuid,
	"status" "swap_listing_status" DEFAULT 'LISTED' NOT NULL,
	"borrower_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customization_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region" text DEFAULT 'IN' NOT NULL,
	"garment_type" "garment_type" NOT NULL,
	"name" text NOT NULL,
	"options_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"region" text DEFAULT 'IN' NOT NULL,
	"unit" text DEFAULT 'CM' NOT NULL,
	"points" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailoring_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid,
	"measurement_profile_id" uuid,
	"selections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fabric_ref" text,
	"fabric_photo_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tailor_seller_id" uuid,
	"measurement_snapshot" jsonb DEFAULT 'null'::jsonb,
	"state" "tailor_order_state" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailoring_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"listing_id" uuid,
	"occasion" "gift_occasion",
	"status" "gift_order_status" DEFAULT 'PLANNED' NOT NULL,
	"affiliate_link" text,
	"wrap_message" text,
	"group_target_minor" integer,
	"group_currency" text DEFAULT 'INR',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_gift_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_order_id" uuid NOT NULL,
	"contributor_user_id" uuid,
	"contributor_name" text,
	"amount_minor" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipient_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"sizes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"taste_tags" text[] DEFAULT '{}' NOT NULL,
	"wishlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"important_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipient_profiles_recipient_id_unique" UNIQUE("recipient_id")
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" "recipient_relationship" DEFAULT 'OTHER' NOT NULL,
	"region" text DEFAULT 'IN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tryon_previews" ALTER COLUMN "listing_variant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "seller_type" "seller_type" DEFAULT 'RETAILER' NOT NULL;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD COLUMN "wardrobe_item_id" uuid;--> statement-breakpoint
ALTER TABLE "disposition_listings" ADD CONSTRAINT "disposition_listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_listings" ADD CONSTRAINT "disposition_listings_wardrobe_item_id_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."wardrobe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposition_listings" ADD CONSTRAINT "disposition_listings_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_metrics" ADD CONSTRAINT "item_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_metrics" ADD CONSTRAINT "item_metrics_wardrobe_item_id_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."wardrobe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfits" ADD CONSTRAINT "outfits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_logs" ADD CONSTRAINT "repair_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_logs" ADD CONSTRAINT "repair_logs_wardrobe_item_id_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."wardrobe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wardrobe_items" ADD CONSTRAINT "wardrobe_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wardrobe_items" ADD CONSTRAINT "wardrobe_items_profile_id_closet_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."closet_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wear_log" ADD CONSTRAINT "wear_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wear_log" ADD CONSTRAINT "wear_log_wardrobe_item_id_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."wardrobe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wear_log" ADD CONSTRAINT "wear_log_outfit_id_outfits_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closet_profiles" ADD CONSTRAINT "closet_profiles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closet_profiles" ADD CONSTRAINT "closet_profiles_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_circle_members" ADD CONSTRAINT "swap_circle_members_circle_id_swap_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."swap_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_circle_members" ADD CONSTRAINT "swap_circle_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_circles" ADD CONSTRAINT "swap_circles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_listings" ADD CONSTRAINT "swap_listings_circle_id_swap_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."swap_circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_listings" ADD CONSTRAINT "swap_listings_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_listings" ADD CONSTRAINT "swap_listings_wardrobe_item_id_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."wardrobe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_listings" ADD CONSTRAINT "swap_listings_disposition_listing_id_disposition_listings_id_fk" FOREIGN KEY ("disposition_listing_id") REFERENCES "public"."disposition_listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_listings" ADD CONSTRAINT "swap_listings_borrower_user_id_users_id_fk" FOREIGN KEY ("borrower_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_profiles" ADD CONSTRAINT "measurement_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_orders" ADD CONSTRAINT "tailoring_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_orders" ADD CONSTRAINT "tailoring_orders_template_id_customization_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."customization_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_orders" ADD CONSTRAINT "tailoring_orders_measurement_profile_id_measurement_profiles_id_fk" FOREIGN KEY ("measurement_profile_id") REFERENCES "public"."measurement_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_orders" ADD CONSTRAINT "tailoring_orders_tailor_seller_id_sellers_id_fk" FOREIGN KEY ("tailor_seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_reviews" ADD CONSTRAINT "tailoring_reviews_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_reviews" ADD CONSTRAINT "tailoring_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailoring_reviews" ADD CONSTRAINT "tailoring_reviews_order_id_tailoring_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."tailoring_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_orders" ADD CONSTRAINT "gift_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_orders" ADD CONSTRAINT "gift_orders_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_orders" ADD CONSTRAINT "gift_orders_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_gift_contributions" ADD CONSTRAINT "group_gift_contributions_gift_order_id_gift_orders_id_fk" FOREIGN KEY ("gift_order_id") REFERENCES "public"."gift_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_gift_contributions" ADD CONSTRAINT "group_gift_contributions_contributor_user_id_users_id_fk" FOREIGN KEY ("contributor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_profiles" ADD CONSTRAINT "recipient_profiles_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disposition_listings_user_created_idx" ON "disposition_listings" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "disposition_listings_wardrobe_item_idx" ON "disposition_listings" USING btree ("wardrobe_item_id");--> statement-breakpoint
CREATE INDEX "disposition_listings_seller_idx" ON "disposition_listings" USING btree ("seller_id") WHERE "disposition_listings"."seller_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "item_metrics_user_updated_idx" ON "item_metrics" USING btree ("user_id","updated_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "outfits_user_planned_for_uidx" ON "outfits" USING btree ("user_id","planned_for") WHERE "outfits"."planned_for" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "outfits_user_generated_idx" ON "outfits" USING btree ("user_id","generated_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "repair_logs_user_created_idx" ON "repair_logs" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "repair_logs_item_created_idx" ON "repair_logs" USING btree ("wardrobe_item_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "wardrobe_items_lent_due_on_idx" ON "wardrobe_items" USING btree ("lent_due_on") WHERE "wardrobe_items"."lent_to" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "wardrobe_items_profile_id_idx" ON "wardrobe_items" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "wardrobe_items_user_created_idx" ON "wardrobe_items" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "wardrobe_items_user_purchase_item_uidx" ON "wardrobe_items" USING btree ("user_id","purchase_item_id") WHERE "wardrobe_items"."purchase_item_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "wear_log_user_worn_on_idx" ON "wear_log" USING btree ("user_id","worn_on" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "wear_log_wardrobe_item_idx" ON "wear_log" USING btree ("wardrobe_item_id");--> statement-breakpoint
CREATE INDEX "wear_log_outfit_idx" ON "wear_log" USING btree ("outfit_id") WHERE "wear_log"."outfit_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "closet_profiles_owner_created_idx" ON "closet_profiles" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "closet_profiles_household_idx" ON "closet_profiles" USING btree ("household_id") WHERE "closet_profiles"."household_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_household_user_uidx" ON "household_members" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "household_members_user_idx" ON "household_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "households_invite_code_uidx" ON "households" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "households_owner_idx" ON "households" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "swap_circle_members_circle_user_uidx" ON "swap_circle_members" USING btree ("circle_id","user_id");--> statement-breakpoint
CREATE INDEX "swap_circle_members_user_idx" ON "swap_circle_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "swap_circles_invite_code_uidx" ON "swap_circles" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "swap_circles_owner_idx" ON "swap_circles" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "swap_listings_circle_created_idx" ON "swap_listings" USING btree ("circle_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "swap_listings_wardrobe_item_idx" ON "swap_listings" USING btree ("wardrobe_item_id");--> statement-breakpoint
CREATE INDEX "swap_listings_owner_idx" ON "swap_listings" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "swap_listings_borrower_idx" ON "swap_listings" USING btree ("borrower_user_id") WHERE "swap_listings"."borrower_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "swap_listings_disposition_listing_idx" ON "swap_listings" USING btree ("disposition_listing_id") WHERE "swap_listings"."disposition_listing_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "measurement_profiles_user_created_idx" ON "measurement_profiles" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tailoring_orders_user_created_idx" ON "tailoring_orders" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tailoring_orders_measurement_profile_idx" ON "tailoring_orders" USING btree ("measurement_profile_id") WHERE "tailoring_orders"."measurement_profile_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tailoring_orders_template_idx" ON "tailoring_orders" USING btree ("template_id") WHERE "tailoring_orders"."template_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tailoring_orders_tailor_seller_idx" ON "tailoring_orders" USING btree ("tailor_seller_id") WHERE "tailoring_orders"."tailor_seller_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tailoring_reviews_seller_created_idx" ON "tailoring_reviews" USING btree ("seller_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "tailoring_reviews_user_idx" ON "tailoring_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tailoring_reviews_order_idx" ON "tailoring_reviews" USING btree ("order_id") WHERE "tailoring_reviews"."order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "gift_orders_user_created_idx" ON "gift_orders" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "gift_orders_recipient_idx" ON "gift_orders" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "gift_orders_listing_idx" ON "gift_orders" USING btree ("listing_id") WHERE "gift_orders"."listing_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "group_gift_contributions_order_created_idx" ON "group_gift_contributions" USING btree ("gift_order_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "group_gift_contributions_contributor_idx" ON "group_gift_contributions" USING btree ("contributor_user_id") WHERE "group_gift_contributions"."contributor_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "recipients_user_created_idx" ON "recipients" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD CONSTRAINT "tryon_previews_wardrobe_item_id_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."wardrobe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tryon_previews_user_wardrobe_idx" ON "tryon_previews" USING btree ("user_id","wardrobe_item_id");