-- Catalog pieces now cost about a coin per ₹10 of their shop price, to the nearest 5 coins and at
-- least 10 (coinPriceForRupees in @worn/shared: ₹549 → 55), so the 500-coin welcome grant buys a
-- first haul of several pieces. Shop listings seeded before this release carry the shop's rupee
-- price as their coin price and, because the Postgres seed dropped them, no partner price and no
-- partner links: those are the seller-less shop listings (tag src:<shop>) with no real_price.
-- Give them the shop price as the partner price, a partner link from their affiliate URL and the
-- scaled coin price, and reprice their variants in open carts (checkout charges the cart's
-- snapshot). Order lines keep the price they were bought at.
WITH "repriced" AS (
  UPDATE "listings" AS "l" SET
    "real_price" = '₹' || to_char("l"."coin_price", 'FM99,99,99,999'),
    "coin_price" = GREATEST(10, ROUND("l"."coin_price" / 50.0) * 5)::integer,
    "affiliate_links" = CASE
      WHEN "l"."affiliate_url" IS NULL THEN NULL
      ELSE jsonb_build_array(jsonb_build_object(
        'url', "l"."affiliate_url",
        'label', "s"."shop",
        'platform', CASE WHEN "s"."shop" IN ('amazon', 'flipkart') THEN "s"."shop" ELSE 'other' END
      ))
    END,
    "updated_at" = now()
  FROM (
    SELECT "id", (SELECT substr("t", 5) FROM unnest("tags") AS "t" WHERE "t" LIKE 'src:%' LIMIT 1) AS "shop"
    FROM "listings"
  ) AS "s"
  WHERE "s"."id" = "l"."id"
    AND "l"."seller_id" IS NULL
    AND "l"."real_price" IS NULL
    AND "s"."shop" IN ('newme', 'shein', 'amazon', 'flipkart')
  RETURNING "l"."id", "l"."coin_price"
)
UPDATE "cart_items" SET "coin_price_snapshot" = "repriced"."coin_price", "updated_at" = now()
FROM "listing_variants", "repriced"
WHERE "cart_items"."listing_variant_id" = "listing_variants"."id"
  AND "listing_variants"."listing_id" = "repriced"."id";
