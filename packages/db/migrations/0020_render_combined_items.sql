-- A combined render's items get their own column. Earlier builds kept them in provider as
-- "combined:<id>,<id>", which the render pipeline overwrote with the provider's name once the
-- render was done, so a finished combined render no longer said what it was made of. Copy the ids
-- out of any row still carrying the marker; the API also reads the marker as a fallback.
ALTER TABLE "renders" ADD COLUMN "combined_item_ids" uuid[];--> statement-breakpoint
UPDATE "renders" SET "combined_item_ids" = string_to_array(substr("provider", length('combined:') + 1), ',')::uuid[]
WHERE "provider" ~ '^combined:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(,[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})*$';
