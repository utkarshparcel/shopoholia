-- Clears the rows that would stop 0014's new unique indexes and foreign keys from being built:
--   merchant_purchases_user_order_ref_idx (now UNIQUE), return_requests_open_line_uidx,
--   disposition_listings_active_item_uidx, receipts.user_id / warranties.user_id -> users.id.
-- Every step only touches rows that still break a rule, so on a clean database it changes nothing.

-- 1. One purchase per (user_id, order_ref). Keep the first of each group, preferring a row that is
--    not DUPLICATE, then a CONFIRMED one, then the oldest. The others become what a merge leaves:
--    status DUPLICATE, total_minor 0, order_ref cleared. Their lines, receipts and returns stay on
--    them (moving lines would double the kept purchase); spend reads skip DUPLICATE purchases.
UPDATE merchant_purchases p
SET status = 'DUPLICATE', total_minor = 0, order_ref = NULL, updated_at = now()
FROM (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, order_ref
           ORDER BY (status = 'DUPLICATE'), (status <> 'CONFIRMED'), created_at, id
         ) AS rn
  FROM merchant_purchases
  WHERE order_ref IS NOT NULL
) ranked
WHERE p.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint
-- 2. One open return (not CANCELLED/EXPIRED) per (user_id, purchase_id, purchase_item_id), NULLs
--    equal. Keep the most advanced one, then the oldest; cancel the others, each with a
--    return_events row so the history says why.
CREATE TEMP TABLE closet_bf_return_dupes ON COMMIT DROP AS
SELECT id AS dupe_id, keep_id, state AS old_state
FROM (
  SELECT id, state,
         first_value(id) OVER w AS keep_id,
         row_number() OVER w AS rn
  FROM return_requests
  WHERE state NOT IN ('CANCELLED', 'EXPIRED')
  WINDOW w AS (
    PARTITION BY user_id,
                 coalesce(purchase_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(purchase_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY CASE state
               WHEN 'REFUNDED' THEN 0
               WHEN 'CONFIRMED' THEN 1
               WHEN 'PICKUP_SCHEDULED' THEN 2
               WHEN 'INITIATED' THEN 3
               ELSE 4
             END,
             created_at, id
  )
) ranked
WHERE rn > 1;
--> statement-breakpoint
INSERT INTO return_events (return_request_id, from_state, to_state, actor, meta)
SELECT dupe_id, old_state::text, 'CANCELLED', 'system.backfill',
       jsonb_build_object('reason', 'duplicate open return', 'keptReturnId', keep_id)
FROM closet_bf_return_dupes;
--> statement-breakpoint
UPDATE return_requests r
SET state = 'CANCELLED', updated_at = now()
FROM closet_bf_return_dupes d
WHERE r.id = d.dupe_id;
--> statement-breakpoint
-- 3. One ACTIVE disposition listing per wardrobe item. Keep one a swap listing points at, then the
--    oldest; cancel the others.
UPDATE disposition_listings l
SET status = 'CANCELLED', updated_at = now()
FROM (
  SELECT d.id,
         row_number() OVER (
           PARTITION BY d.wardrobe_item_id
           ORDER BY NOT EXISTS (SELECT 1 FROM swap_listings s WHERE s.disposition_listing_id = d.id),
                    d.created_at, d.id
         ) AS rn
  FROM disposition_listings d
  WHERE d.status = 'ACTIVE'
) ranked
WHERE l.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint
-- 4. Receipts and warranties whose user no longer exists belong to no one, and the FK cannot be
--    added while they exist. Warranties first; deleting a receipt nulls warranties.receipt_id anyway.
DELETE FROM warranties w WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = w.user_id);
--> statement-breakpoint
DELETE FROM receipts r WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.user_id);
