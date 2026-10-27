-- Privacy backfill. Run once after migrations 0013-0015 (0014 adds consent_records, audit_log,
-- privacy_requests and ingestion_{documents,sources}.user_id; 0015 makes consent_records
-- append-only), and before the new API serves traffic (step 3 assumes nobody grants or
-- withdraws while it runs). Safe to re-run: every step only touches rows it has not done yet.
-- Not a migration: it needs the API secret and commits per batch.
--
--   psql -X -v ON_ERROR_STOP=1 -v privacy_hmac_secret="$PRIVACY_HMAC_SECRET" -d <db> -f packages/db/scripts/privacy-backfill.sql
--
-- The secret must be the API's PRIVACY_HMAC_SECRET: consent_records.subject_ref is
-- HMAC-SHA256(secret, 'subject' || 0x00 || user_id) in hex, the same as subjectRefFor() in
-- apps/api/src/lib/privacy-hmac.ts. It is held in a session setting, so turn statement logging
-- off for this session if the server logs statements.
--
-- Run it in autocommit mode (psql's default): step 2 commits per batch of 5000 documents so no
-- statement locks the whole table.

\if :{?privacy_hmac_secret}
\else
DO $$ BEGIN RAISE EXCEPTION 'pass -v privacy_hmac_secret=<the API PRIVACY_HMAC_SECRET>'; END $$;
\endif
SELECT set_config('worn.privacy_hmac_secret', :'privacy_hmac_secret', false) IS NOT NULL AS secret_set;
DO $$
BEGIN
  IF length(current_setting('worn.privacy_hmac_secret')) < 16 THEN
    RAISE EXCEPTION 'privacy_hmac_secret must be at least 16 characters (as the API requires)';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION pg_temp.subject_ref(uid uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT encode(
    hmac(
      convert_to('subject', 'UTF8') || '\x00'::bytea || convert_to(uid::text, 'UTF8'),
      convert_to(current_setting('worn.privacy_hmac_secret'), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

-- 1. ingestion_sources.user_id: the owner of the consent grant the source was connected under.
UPDATE ingestion_sources s
SET user_id = g.user_id, updated_at = now()
FROM consent_grants g
WHERE s.user_id IS NULL AND g.id = s.consent_grant_id;

-- 2. ingestion_documents.user_id, keyset batches of 5000 by id, from (in order) the matched
--    purchase, the purchase that names the document as its raw doc, then the legacy
--    parsed_json "__userId" when it is an existing user's id. Documents none of these resolve
--    stay NULL (the API still finds them through the same legacy rules) and are counted below.
DO $$
DECLARE
  after_id uuid := '00000000-0000-0000-0000-000000000000';
  last_id uuid;
BEGIN
  LOOP
    -- The batch's last id (NULL when nothing is left; Postgres has no max(uuid)).
    SELECT b.id INTO last_id
    FROM (
      SELECT d.id FROM ingestion_documents d
      WHERE d.user_id IS NULL AND d.id > after_id
      ORDER BY d.id
      LIMIT 5000
    ) b
    ORDER BY b.id DESC
    LIMIT 1;
    EXIT WHEN last_id IS NULL;

    UPDATE ingestion_documents d
    SET user_id = o.owner, updated_at = now()
    FROM (
      SELECT d2.id,
             coalesce(
               (SELECT p.user_id FROM merchant_purchases p WHERE p.id = d2.matched_purchase_id),
               (SELECT p.user_id FROM merchant_purchases p
                 WHERE p.raw_doc_id = d2.id ORDER BY p.created_at, p.id LIMIT 1),
               (SELECT u.id FROM users u
                 WHERE d2.parsed_json->>'__userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   AND u.id = (d2.parsed_json->>'__userId')::uuid)
             ) AS owner
      FROM ingestion_documents d2
      WHERE d2.user_id IS NULL AND d2.id > after_id AND d2.id <= last_id
    ) o
    WHERE d.id = o.id AND o.owner IS NOT NULL;

    after_id := last_id;
    COMMIT;
  END LOOP;
END $$;

-- 3. Seed the append-only consent history from the grants that predate it: one GRANT per
--    grant at granted_at, and one WITHDRAW per revoked grant at revoked_at. notice_version
--    stays NULL (those grants were taken before the versioned notice).
INSERT INTO consent_records (user_id, subject_ref, scope, action, notice_version, source, grant_id, created_at)
SELECT g.user_id, pg_temp.subject_ref(g.user_id), g.scope, 'GRANT', g.notice_version, g.source, g.id, g.granted_at
FROM consent_grants g
WHERE NOT EXISTS (SELECT 1 FROM consent_records r WHERE r.grant_id = g.id AND r.action = 'GRANT');

INSERT INTO consent_records (user_id, subject_ref, scope, action, notice_version, source, grant_id, created_at)
SELECT g.user_id, pg_temp.subject_ref(g.user_id), g.scope, 'WITHDRAW', NULL, g.source, g.id, g.revoked_at
FROM consent_grants g
WHERE g.revoked_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM consent_records r WHERE r.grant_id = g.id AND r.action = 'WITHDRAW');

-- What is left for a person to look at.
SELECT
  (SELECT count(*) FROM ingestion_sources WHERE user_id IS NULL) AS sources_without_owner,
  (SELECT count(*) FROM ingestion_documents WHERE user_id IS NULL) AS documents_without_owner,
  (SELECT count(*) FROM consent_grants g
     WHERE NOT EXISTS (SELECT 1 FROM consent_records r WHERE r.grant_id = g.id)) AS grants_without_history;
