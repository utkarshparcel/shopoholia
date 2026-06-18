CREATE TYPE "public"."seller_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"shop_name" text NOT NULL,
	"status" "seller_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sellers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;
