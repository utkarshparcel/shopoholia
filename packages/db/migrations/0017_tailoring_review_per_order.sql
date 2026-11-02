-- One review per tailoring order. Earlier builds let an order be reviewed more than once: the
-- oldest review keeps the order, later ones keep their text but lose the link, so the unique
-- index can be built without deleting anything.
UPDATE "tailoring_reviews" r SET "order_id" = NULL
WHERE r."order_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "tailoring_reviews" o
    WHERE o."order_id" = r."order_id"
      AND (o."created_at", o."id") < (r."created_at", r."id")
  );--> statement-breakpoint
DROP INDEX "tailoring_reviews_order_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "tailoring_reviews_order_idx" ON "tailoring_reviews" USING btree ("order_id") WHERE "tailoring_reviews"."order_id" IS NOT NULL;
