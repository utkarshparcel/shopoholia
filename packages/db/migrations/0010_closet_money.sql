CREATE TYPE "public"."budget_category" AS ENUM('APPAREL', 'FOOTWEAR', 'ACCESSORIES', 'BEAUTY', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."budget_period" AS ENUM('MONTHLY', 'QUARTERLY');--> statement-breakpoint
CREATE TYPE "public"."cashback_claim_status" AS ENUM('UNCLAIMED', 'CLAIMED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."emi_plan_status" AS ENUM('ACTIVE', 'PAID', 'DEFAULTED');--> statement-breakpoint
CREATE TYPE "public"."money_account_kind" AS ENUM('CASH', 'STORE_CREDIT', 'GIFT_CARD', 'LOYALTY_POINTS', 'PROMO_CREDIT');--> statement-breakpoint
CREATE TYPE "public"."money_account_status" AS ENUM('ACTIVE', 'FROZEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."money_ledger_type" AS ENUM('DEPOSIT', 'WITHDRAW', 'SPEND', 'REFUND', 'TRANSFER_IN', 'TRANSFER_OUT', 'PURCHASE_REWARD');--> statement-breakpoint
CREATE TABLE "money_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "money_account_kind" NOT NULL,
	"merchant" text NOT NULL,
	"currency" text NOT NULL,
	"balance_cache_minor" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "money_account_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"type" "money_ledger_type" NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"balance_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "budget_category" NOT NULL,
	"period" "budget_period" NOT NULL,
	"limit_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"category" text NOT NULL,
	"total_minor" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emi_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"merchant" text,
	"principal_minor" integer NOT NULL,
	"remaining_minor" integer NOT NULL,
	"installment_minor" integer NOT NULL,
	"next_due_on" date NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "emi_plan_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashback_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"merchant" text,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "cashback_claim_status" DEFAULT 'UNCLAIMED' NOT NULL,
	"notes" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_price_watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"watched_price_minor" integer NOT NULL,
	"threshold_pct" integer DEFAULT 10 NOT NULL,
	"last_seen_price_minor" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_accounts" ADD CONSTRAINT "money_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_ledger" ADD CONSTRAINT "money_ledger_account_id_money_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_ledger" ADD CONSTRAINT "money_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_rollups" ADD CONSTRAINT "spend_rollups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emi_plans" ADD CONSTRAINT "emi_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashback_claims" ADD CONSTRAINT "cashback_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_price_watches" ADD CONSTRAINT "brand_price_watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "money_accounts_user_created_idx" ON "money_accounts" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "money_ledger_ref_id_idx" ON "money_ledger" USING btree ("user_id","ref_id","type") WHERE "money_ledger"."ref_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "money_ledger_user_created_idx" ON "money_ledger" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "money_ledger_account_created_idx" ON "money_ledger" USING btree ("account_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "budgets_user_created_idx" ON "budgets" USING btree ("user_id","created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE UNIQUE INDEX "spend_rollups_user_period_category_uidx" ON "spend_rollups" USING btree ("user_id","period","category");--> statement-breakpoint
CREATE INDEX "emi_plans_user_next_due_idx" ON "emi_plans" USING btree ("user_id","next_due_on");--> statement-breakpoint
CREATE INDEX "cashback_claims_user_status_idx" ON "cashback_claims" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "brand_price_watches_user_created_idx" ON "brand_price_watches" USING btree ("user_id","created_at" DESC NULLS FIRST);