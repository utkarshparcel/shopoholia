-- The reveal rating gets its own column. Earlier builds stored it inside state_eta, whose values
-- the API serialises as ETAs keyed by order state, so a rated order broke GET /orders. Move any
-- stored rating into the column and drop the key from state_eta.
ALTER TABLE "orders" ADD COLUMN "reveal_rating" text;--> statement-breakpoint
UPDATE "orders" SET "reveal_rating" = "state_eta"->>'rating'
WHERE "state_eta" ? 'rating' AND "state_eta"->>'rating' IN ('loved', 'ok', 'meh');--> statement-breakpoint
UPDATE "orders" SET "state_eta" = "state_eta" - 'rating' WHERE "state_eta" ? 'rating';
