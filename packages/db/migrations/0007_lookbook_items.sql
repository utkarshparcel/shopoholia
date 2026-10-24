CREATE TABLE IF NOT EXISTS "lookbook_items" (
	"user_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lookbook_items_user_id_listing_id_pk" PRIMARY KEY("user_id","listing_id"),
	CONSTRAINT "lookbook_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "lookbook_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lookbook_items_user_id_created_at_idx" ON "lookbook_items" USING btree ("user_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lookbook_items_listing_id_idx" ON "lookbook_items" USING btree ("listing_id");
