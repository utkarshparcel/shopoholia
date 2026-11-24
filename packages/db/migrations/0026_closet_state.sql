CREATE TABLE "gift_budget_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"occasion" text NOT NULL,
	"occasion_day" text NOT NULL,
	"occasion_date" timestamp with time zone NOT NULL,
	"budget_lock_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"shortlist_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lent_waste_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wardrobe_item_id" uuid,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_aliases" (
	"user_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"canonical" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_aliases_user_id_alias_pk" PRIMARY KEY("user_id","alias")
);
--> statement-breakpoint
CREATE TABLE "parser_break_flags" (
	"merchant_key" text PRIMARY KEY NOT NULL,
	"merchant" text NOT NULL,
	"reason" text NOT NULL,
	"region" text,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parser_training_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"merchant_hint" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"export_status" text DEFAULT 'QUEUED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_accounts" ADD COLUMN "reconcile_investigated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "disposition_listings" ADD COLUMN "pickup_booking" jsonb;--> statement-breakpoint
ALTER TABLE "wardrobe_items" ADD COLUMN "photo_dump_triaged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wardrobe_items" ADD COLUMN "keep_snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "measurement_profiles" ADD COLUMN "change_note" text;--> statement-breakpoint
ALTER TABLE "measurement_profiles" ADD COLUMN "previous_id" uuid;--> statement-breakpoint
ALTER TABLE "tailoring_orders" ADD COLUMN "expected_pickup_on" date;--> statement-breakpoint
ALTER TABLE "tailoring_orders" ADD COLUMN "pickup_nudge_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "household_vault_settings" ADD COLUMN "spend_cap_currency" text;--> statement-breakpoint
ALTER TABLE "gift_budget_locks" ADD CONSTRAINT "gift_budget_locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_budget_locks" ADD CONSTRAINT "gift_budget_locks_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lent_waste_notes" ADD CONSTRAINT "lent_waste_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lent_waste_notes" ADD CONSTRAINT "lent_waste_notes_wardrobe_item_id_wardrobe_items_id_fk" FOREIGN KEY ("wardrobe_item_id") REFERENCES "public"."wardrobe_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_aliases" ADD CONSTRAINT "merchant_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parser_training_fixtures" ADD CONSTRAINT "parser_training_fixtures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parser_training_fixtures" ADD CONSTRAINT "parser_training_fixtures_document_id_ingestion_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ingestion_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_budget_locks_recipient_occasion_day_uidx" ON "gift_budget_locks" USING btree ("recipient_id","occasion","occasion_day");--> statement-breakpoint
CREATE INDEX "gift_budget_locks_user_idx" ON "gift_budget_locks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lent_waste_notes_user_created_idx" ON "lent_waste_notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "lent_waste_notes_wardrobe_item_idx" ON "lent_waste_notes" USING btree ("wardrobe_item_id");--> statement-breakpoint
CREATE INDEX "parser_training_fixtures_created_idx" ON "parser_training_fixtures" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "parser_training_fixtures_user_idx" ON "parser_training_fixtures" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "parser_training_fixtures_document_idx" ON "parser_training_fixtures" USING btree ("document_id");--> statement-breakpoint
ALTER TABLE "measurement_profiles" ADD CONSTRAINT "measurement_profiles_previous_id_measurement_profiles_id_fk" FOREIGN KEY ("previous_id") REFERENCES "public"."measurement_profiles"("id") ON DELETE set null ON UPDATE no action;