CREATE TYPE "public"."consent_scope" AS ENUM('EMAIL', 'SMS', 'FINANCIAL', 'LIKENESS', 'CONCIERGE');--> statement-breakpoint
CREATE TYPE "public"."ingestion_doc_status" AS ENUM('RECEIVED', 'PARSED', 'MATCHED', 'UNMATCHED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."ingestion_kind" AS ENUM('EMAIL', 'SMS', 'RECEIPT');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('IDLE', 'SYNCING', 'PAUSED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."package_delivery_status" AS ENUM('ORDERED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."purchase_source" AS ENUM('EMAIL', 'SMS', 'MANUAL', 'RECEIPT');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('PENDING', 'CONFIRMED', 'REJECTED', 'DUPLICATE');--> statement-breakpoint
CREATE TABLE "consent_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" "consent_scope" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"source" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "ingestion_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ingestion_kind" NOT NULL,
	"raw_key" text NOT NULL,
	"parsed_json" jsonb NOT NULL,
	"matched_purchase_id" uuid,
	"status" "ingestion_doc_status" DEFAULT 'RECEIVED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ingestion_kind" NOT NULL,
	"provider" text NOT NULL,
	"consent_grant_id" uuid NOT NULL,
	"status" "ingestion_status" DEFAULT 'IDLE' NOT NULL,
	"cursor" text,
	"last_sync_at" timestamp with time zone,
	"encrypted_token" jsonb DEFAULT 'null'::jsonb,
	"meta" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"brand" text,
	"price_minor" integer NOT NULL,
	"image_key" text,
	"qty" integer DEFAULT 1 NOT NULL,
	"duplicate_wardrobe_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "purchase_source" NOT NULL,
	"merchant" text NOT NULL,
	"order_ref" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text NOT NULL,
	"total_minor" integer NOT NULL,
	"status" "purchase_status" DEFAULT 'CONFIRMED' NOT NULL,
	"raw_doc_id" uuid,
	"delivery_status" "package_delivery_status" DEFAULT 'ORDERED' NOT NULL,
	"eta_at" timestamp with time zone,
	"tracking_code" text,
	"carrier" text,
	"delivered_at" timestamp with time zone,
	"return_window_deadline" timestamp with time zone,
	"exchange_window_deadline" timestamp with time zone,
	"delivery_address_note" text,
	"delivery_proof_keys" text,
	"assignee_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"merchant" text NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_minor" integer DEFAULT 0 NOT NULL,
	"ocr_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"purchase_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_grants" ADD CONSTRAINT "consent_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_sources" ADD CONSTRAINT "ingestion_sources_consent_grant_id_consent_grants_id_fk" FOREIGN KEY ("consent_grant_id") REFERENCES "public"."consent_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchase_items" ADD CONSTRAINT "merchant_purchase_items_purchase_id_merchant_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."merchant_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchases" ADD CONSTRAINT "merchant_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_purchases" ADD CONSTRAINT "merchant_purchases_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_purchase_id_merchant_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."merchant_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_grants_user_idx" ON "consent_grants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_grants_user_scope_active_uidx" ON "consent_grants" USING btree ("user_id","scope") WHERE "consent_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ingestion_documents_user_created_idx" ON "ingestion_documents" USING btree (("parsed_json"->>'__userId'),"created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "ingestion_documents_matched_purchase_idx" ON "ingestion_documents" USING btree ("matched_purchase_id") WHERE "ingestion_documents"."matched_purchase_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ingestion_sources_consent_grant_idx" ON "ingestion_sources" USING btree ("consent_grant_id");--> statement-breakpoint
CREATE INDEX "merchant_purchase_items_purchase_created_idx" ON "merchant_purchase_items" USING btree ("purchase_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "merchant_purchases_user_created_idx" ON "merchant_purchases" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "merchant_purchases_user_order_ref_idx" ON "merchant_purchases" USING btree ("user_id","order_ref") WHERE "merchant_purchases"."order_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "merchant_purchases_assignee_idx" ON "merchant_purchases" USING btree ("assignee_user_id") WHERE "merchant_purchases"."assignee_user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "receipts_user_created_idx" ON "receipts" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "receipts_purchase_idx" ON "receipts" USING btree ("purchase_id") WHERE "receipts"."purchase_id" IS NOT NULL;