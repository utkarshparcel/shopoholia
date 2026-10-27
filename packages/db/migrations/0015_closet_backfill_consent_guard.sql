-- Data that 0014's new columns need, and the consent_records guard Drizzle cannot declare.
-- Every step only touches rows the old code wrote, so on a clean database it changes nothing.
-- The privacy backfill (ingestion owners, consent history) needs the API's HMAC secret and runs
-- once by hand: packages/db/scripts/privacy-backfill.sql.

-- 1. users.time_zone from consent_flags.timeZone (else .timezone), when it is a zone Postgres knows
--    and isValidTimeZone (packages/shared/src/local-time.ts) accepts too: same pattern, at most 64
--    characters, not 'Factory' (the one pg_timezone_names entry ICU rejects). Only rows still on the
--    column default.
WITH zones AS MATERIALIZED (
  SELECT name FROM pg_timezone_names
  WHERE name <> 'Factory'
    AND length(name) <= 64
    AND name ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$'
),
picked AS (
  SELECT u.id,
         COALESCE(
           (SELECT z.name FROM zones z
             WHERE jsonb_typeof(u.consent_flags -> 'timeZone') = 'string'
               AND z.name = u.consent_flags ->> 'timeZone'),
           (SELECT z.name FROM zones z
             WHERE jsonb_typeof(u.consent_flags -> 'timezone') = 'string'
               AND z.name = u.consent_flags ->> 'timezone')
         ) AS tz
  FROM users u
  WHERE u.time_zone = 'Asia/Kolkata'
    AND (u.consent_flags ? 'timeZone' OR u.consent_flags ? 'timezone')
)
UPDATE users u
SET time_zone = p.tz
FROM picked p
WHERE u.id = p.id
  AND p.tz IS NOT NULL
  AND u.time_zone <> p.tz;
--> statement-breakpoint
-- 2. users.prefs: the setting keys from consent_flags, in today's shapes. A key already in prefs wins
--    (`copied || prefs`); values of the wrong JSON type are skipped.
UPDATE users
SET prefs = (
      CASE WHEN jsonb_typeof(consent_flags -> 'notifications') = 'object'
           THEN jsonb_build_object('notifications', consent_flags -> 'notifications') ELSE '{}'::jsonb END
   || CASE WHEN jsonb_typeof(consent_flags -> 'coolingOff') = 'object'
           THEN jsonb_build_object('coolingOff', consent_flags -> 'coolingOff') ELSE '{}'::jsonb END
   || CASE WHEN jsonb_typeof(consent_flags -> 'capsuleItemIds') = 'array'
           THEN jsonb_build_object('capsuleItemIds', consent_flags -> 'capsuleItemIds') ELSE '{}'::jsonb END
   || CASE WHEN jsonb_typeof(consent_flags -> 'emailConnected') = 'boolean'
           THEN jsonb_build_object('emailConnected', consent_flags -> 'emailConnected') ELSE '{}'::jsonb END
    ) || prefs
WHERE consent_flags ?| ARRAY['notifications', 'coolingOff', 'capsuleItemIds', 'emailConnected']
  AND NOT (prefs ?& ARRAY(
        SELECT k FROM unnest(ARRAY['notifications', 'coolingOff', 'capsuleItemIds', 'emailConnected']) AS k
        WHERE consent_flags ? k));
--> statement-breakpoint
-- 3. Wardrobe try-ons the old route stored as READY without a real render (a never-uploaded
--    'wardrobe-tryon/...' key, the garment photo itself, or the mock provider) become FAILED and
--    retryable now, so the next request renders for real or answers NO_AVATAR / 503.
UPDATE tryon_previews AS tp
SET status = 'FAILED',
    image_key = NULL,
    error = 'No real render was stored for this item',
    retry_after = now(),
    updated_at = now()
FROM wardrobe_items AS wi
WHERE tp.wardrobe_item_id = wi.id
  AND coalesce(tp.status, CASE WHEN tp.image_key IS NOT NULL THEN 'READY' ELSE 'PROCESSING' END) = 'READY'
  AND (
    tp.image_key LIKE 'wardrobe-tryon/%'
    OR tp.image_key = wi.garment_image_key
    OR tp.image_key = ANY (wi.image_keys)
    OR tp.provider LIKE 'mock%'
  );
--> statement-breakpoint
-- 4. Every other try-on gets the status the code derives for a null one; one with no image never
--    finished: FAILED, retryable now.
UPDATE tryon_previews SET status = 'READY' WHERE status IS NULL AND image_key IS NOT NULL;
--> statement-breakpoint
UPDATE tryon_previews
SET status = 'FAILED', error = 'The render did not finish', retry_after = now(), updated_at = now()
WHERE status IS NULL AND image_key IS NULL;
--> statement-breakpoint
-- 5. Outfits planned with invented ("mock") weather lose the weather fields and reasons; pins, alt
--    index and occasion stay.
UPDATE outfits
SET weather_ctx = (weather_ctx - 'tempC' - 'condition' - 'source' - 'fetchedAt')
  || CASE
       WHEN jsonb_typeof(weather_ctx -> 'whyThis') = 'array' THEN jsonb_build_object(
         'whyThis',
         (SELECT coalesce(jsonb_agg(r), '[]'::jsonb)
          FROM jsonb_array_elements_text(weather_ctx -> 'whyThis') AS r
          WHERE r NOT LIKE 'Weather %'))
       ELSE '{}'::jsonb
     END,
    updated_at = now()
WHERE weather_ctx ->> 'source' = 'mock';
--> statement-breakpoint
-- 6. consent_records is append-only. The one change allowed is erasure: the FK's ON DELETE SET NULL
--    clears user_id and nothing else (the proof stays under subject_ref).
CREATE OR REPLACE FUNCTION consent_records_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NULL
     AND (NEW.id, NEW.subject_ref, NEW.scope, NEW.action, NEW.notice_version, NEW.source, NEW.grant_id, NEW.created_at)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.subject_ref, OLD.scope, OLD.action, OLD.notice_version, OLD.source, OLD.grant_id, OLD.created_at)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'consent_records is append-only (% refused)', TG_OP;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS consent_records_append_only ON consent_records;
--> statement-breakpoint
CREATE TRIGGER consent_records_append_only
  BEFORE UPDATE OR DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION consent_records_append_only();
