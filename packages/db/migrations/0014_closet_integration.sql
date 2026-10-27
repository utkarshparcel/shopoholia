CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"subject_ref" text NOT NULL,
	"scope" "consent_scope" NOT NULL,
	"action" text NOT NULL,
	"notice_version" text,
	"source" text NOT NULL,
	"grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"subject_ref" text,
	"event" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"subject_ref" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"storage_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_key" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_grants" (
	"user_id" uuid NOT NULL,
	"entitlement_id" text NOT NULL,
	"product_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	"is_trial" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"store_ref" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_grants_user_id_entitlement_id_product_id_source_pk" PRIMARY KEY("user_id","entitlement_id","product_id","source")
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"product_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"upi_intent_url" text,
	"status" text DEFAULT 'created' NOT NULL,
	"provider_order_id" text,
	"provider_payment_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intents_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "payment_intents_provider_payment_id_unique" UNIQUE("provider_payment_id")
);
--> statement-breakpoint
CREATE TABLE "job_dead_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" text NOT NULL,
	"job_id" text NOT NULL,
	"job_name" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text NOT NULL,
	"attempts_made" integer NOT NULL,
	"failed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"nonce" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fit_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"selections_key" text NOT NULL,
	"garment_key" text NOT NULL,
	"status" text DEFAULT 'PROCESSING' NOT NULL,
	"image_key" text,
	"error" text,
	"retry_after" timestamp with time zone,
	"provider" text NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_vault_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vault_access" text DEFAULT 'VIEW' NOT NULL,
	"spend_cap_minor" integer,
	"spent_minor" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"item_ids" uuid[] NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"occasion" text,
	"remind_at" timestamp with time zone,
	"reminder_scheduled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wear_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wardrobe_item_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"choice" text NOT NULL,
	"voter_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"item_label" text,
	"return_request_id" uuid,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planned_for" date,
	"winner_applied_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "merchant_purchases_user_order_ref_idx";--> statement-breakpoint
ALTER TABLE "closet_profiles" ALTER COLUMN "kind" SET DEFAULT 'SELF';--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD COLUMN "store" text;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD COLUMN "store_transaction_id" text;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD COLUMN "refunded_coins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "iap_receipts" ADD COLUMN "refund_shortfall" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "tryon_previews" ADD COLUMN "retry_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "wardrobe_items" ADD COLUMN "discarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wear_log" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "group_gift_contributions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "consent_grants" ADD COLUMN "notice_version" text;--> statement-breakpoint
ALTER TABLE "ingestion_documents" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "ingestion_sources" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "emi_plans" ADD COLUMN "last_payment_key" text;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_events" ADD CONSTRAINT "entitlement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_source_id_ingestion_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ingestion_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_previews" ADD CONSTRAINT "fit_previews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fit_previews" ADD CONSTRAINT "fit_previews_template_id_customization_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."customization_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_vault_settings" ADD CONSTRAINT "household_vault_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_vault_settings" ADD CONSTRAINT "household_vault_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_kits" ADD CONSTRAINT "interview_kits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wear_challenges" ADD CONSTRAINT "wear_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wear_challenges" ADD CONSTRAINT "wear_challenges_wardrobe_item_id_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."wardrobe_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_poll_votes" ADD CONSTRAINT "social_poll_votes_poll_id_social_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."social_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_polls" ADD CONSTRAINT "social_polls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_user_created_idx" ON "consent_records" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "consent_records_subject_ref_idx" ON "consent_records" USING btree ("subject_ref");--> statement-breakpoint
CREATE INDEX "audit_log_user_at_idx" ON "audit_log" USING btree ("user_id","at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_requests_open_uidx" ON "privacy_requests" USING btree ("subject_ref","kind") WHERE "privacy_requests"."status" IN ('PENDING', 'RUNNING');--> statement-breakpoint
CREATE INDEX "privacy_requests_user_idx" ON "privacy_requests" USING btree ("user_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payment_intents_user_id_idx" ON "payment_intents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_dead_letters_queue_job_idx" ON "job_dead_letters" USING btree ("queue","job_id");--> statement-breakpoint
CREATE INDEX "job_dead_letters_failed_at_idx" ON "job_dead_letters" USING btree ("failed_at");--> statement-breakpoint
CREATE INDEX "oauth_states_user_id_idx" ON "oauth_states" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_codes_phone_created_at_idx" ON "otp_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fit_previews_user_template_selections_uidx" ON "fit_previews" USING btree ("user_id","template_id","selections_key");--> statement-breakpoint
CREATE UNIQUE INDEX "household_vault_settings_household_user_uidx" ON "household_vault_settings" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "household_vault_settings_user_idx" ON "household_vault_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "interview_kits_user_event_idx" ON "interview_kits" USING btree ("user_id","event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wear_challenges_user_item_uidx" ON "wear_challenges" USING btree ("user_id","wardrobe_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_poll_votes_poll_voter_uidx" ON "social_poll_votes" USING btree ("poll_id","voter_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "social_polls_token_hash_uidx" ON "social_polls" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "social_polls_user_created_idx" ON "social_polls" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ingestion_documents" ADD CONSTRAINT "ingestion_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_sources" ADD CONSTRAINT "ingestion_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "iap_receipts_store_transaction_uidx" ON "iap_receipts" USING btree ("store","store_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disposition_listings_active_item_uidx" ON "disposition_listings" USING btree ("wardrobe_item_id") WHERE "disposition_listings"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "wear_log_user_idempotency_uidx" ON "wear_log" USING btree ("user_id","idempotency_key") WHERE "wear_log"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "group_gift_contributions_order_idem_uidx" ON "group_gift_contributions" USING btree ("gift_order_id","idempotency_key") WHERE "group_gift_contributions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ingestion_documents_user_id_created_idx" ON "ingestion_documents" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ingestion_documents_retention_idx" ON "ingestion_documents" USING btree ("kind","created_at") WHERE "ingestion_documents"."raw_key" <> '';--> statement-breakpoint
CREATE INDEX "ingestion_sources_user_created_idx" ON "ingestion_sources" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "return_requests_open_line_uidx" ON "return_requests" USING btree ("user_id",coalesce("purchase_id", '00000000-0000-0000-0000-000000000000'::uuid),coalesce("purchase_item_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "return_requests"."state" NOT IN ('CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_purchases_user_order_ref_idx" ON "merchant_purchases" USING btree ("user_id","order_ref") WHERE "merchant_purchases"."order_ref" IS NOT NULL;