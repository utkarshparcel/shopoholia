CREATE TYPE "public"."return_state" AS ENUM('REQUESTED', 'INITIATED', 'PICKUP_SCHEDULED', 'CONFIRMED', 'REFUNDED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."warranty_state" AS ENUM('ACTIVE', 'CLAIMED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "warranties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"receipt_id" uuid,
	"item_title" text NOT NULL,
	"provider" text NOT NULL,
	"coverage_until" timestamp with time zone NOT NULL,
	"claim_contact" text,
	"category" text,
	"state" "warranty_state" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_request_id" uuid NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"actor" text,
	"meta" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purchase_id" uuid,
	"purchase_item_id" uuid,
	"window_deadline" timestamp with time zone NOT NULL,
	"exchange_deadline" timestamp with time zone,
	"state" "return_state" DEFAULT 'REQUESTED' NOT NULL,
	"refund_minor" integer,
	"method" text,
	"tracking" text,
	"pickup_slot_at" timestamp with time zone,
	"reason" text,
	"ordered_size" text,
	"preferred_size" text,
	"chase_snooze_until" timestamp with time zone,
	"chase_escalated" integer DEFAULT 0 NOT NULL,
	"invoice_requested_at" timestamp with time zone,
	"invoice_receipt_id" uuid,
	"label_image_key" text,
	"label_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_return_request_id_return_requests_id_fk" FOREIGN KEY ("return_request_id") REFERENCES "public"."return_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_purchase_id_merchant_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."merchant_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_purchase_item_id_merchant_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."merchant_purchase_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warranties_user_coverage_idx" ON "warranties" USING btree ("user_id","coverage_until" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "warranties_receipt_idx" ON "warranties" USING btree ("receipt_id") WHERE "warranties"."receipt_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "return_events_request_created_idx" ON "return_events" USING btree ("return_request_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "return_requests_user_created_idx" ON "return_requests" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "return_requests_purchase_idx" ON "return_requests" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "return_requests_purchase_item_idx" ON "return_requests" USING btree ("purchase_item_id") WHERE "return_requests"."purchase_item_id" IS NOT NULL;