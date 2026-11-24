# Playbook: Data-deletion requests / SLAs

**When:** User (or regulator / Play / App Store) requests export or erasure; account deletion URL / in-app delete fails; DPDP/GDPR access request.

**Product paths**

| Action | API / UI |
|--------|----------|
| Export | `GET /vault/export` — Vault privacy actions (JSON share) |
| Delete account | Worn Play: Profile → **Delete account**. Closet: Vault → Your data → Delete my account. Both call `DELETE /vault`, which erases the account **before it answers 202** (all user rows, refresh tokens, stored photos/renders/uploads) and returns the `privacy_requests` row: `status: DONE`, or `RUNNING` when some stored objects failed to delete (the API worker retries those). A `503` means nothing was deleted (database down and no queue for a retry): the app keeps the user signed in to try again. |
| Revoke source | Consent center — `DELETE /ingestion/sources/:id` |
| Retention purge (ops) | `POST /admin/ingestion/retention/purge` — raw blobs past TTL only |

## SLAs

| Request type | Ack | Complete |
|--------------|-----|----------|
| Self-serve in-app delete | Immediate | Immediate: rows when `DELETE /vault` answers; any stored objects left over by a storage error within the worker's retries (minutes) |
| Self-serve export | Immediate | When the export job finishes (`POST /vault/export`, worker) |
| Support-assisted delete (user can’t auth) | 1 business day | **≤ 30 days** (target ≤ 7 days) |
| Regulator / store escalation | 1 business day | Per counsel; aim ≤ 30 days |
| “Delete my Gmail data only” | 1 business day | Disconnect source + confirm retention purge schedule |

Defaults for raw ingestion TTL (after parse): EMAIL **7d** · SMS **14d** · RECEIPT **30d** (`TRUST-RETENTION`).

## Triage

1. Verify identity (signed-in user id / email on account). Never delete on an unverified DM alone.
2. Prefer self-serve: guide Vault → Export, then Delete.
3. If delete already run: find the request (`select status, steps, storage_keys, error from privacy_requests where kind = 'ERASE' and subject_ref = …`; the user id is cleared once DONE). `DONE` = complete. `RUNNING` with `storage_keys` = the account is gone but those objects still exist: make sure the API worker is running (it retries `privacy-erase`), or delete the listed keys from R2 by hand and set the request DONE. `FAILED` = the worker gave up; the user (or support with their session) can run Delete account again.
4. If partial leftovers suspected: check storage keys, ingestion sources, and scheduled retention worker. Listings the user sold as a seller that other users ordered stay, archived and without a seller.

## Support-assisted delete (ops)

1. User exports if they want a copy.
2. Authenticated `DELETE /vault` (user session) — preferred.
3. If account inaccessible: founder/ops path with `ADMIN_SECRET` tooling + manual verify — document ticket id; do not bypass without identity proof.
4. Confirm Gmail disconnect advice (Google Account → Third-party access) in addition to Closet revoke.
5. Reply with completion timestamp + that backups/logs may age out per infra retention (state honestly).

## Guardrails

- Export **redacts** encrypted tokens (`encryptedToken: null`).
- Rate-limit on `DELETE /vault` (abuse protection) — if user hits 429, retry after window; don’t force admin wipe casually.
- Analytics/Sentry may retain scrubbed events briefly — not a substitute for vault wipe; don’t promise “zero log lines forever” unless infra supports it.

## Store / policy alignment

- Play Data Safety and App Privacy labels must say users can delete — see `docs/STORE_LISTINGS.md`.
- Google Play also needs a web page that explains how to request deletion without the app: the privacy policy's "Delete your account" section (`https://worncloset.app/privacy#delete-account`) describes the in-app path and the email path (`privacy@worncloset.app`, handled with the support-assisted steps above).

## Done when

- User confirms account gone **or** ticket closed with export+delete timestamps.
- No active ingestion sources for that user id.
- SLA met or exception logged with counsel.
