# Playbook: Data-deletion requests / SLAs

**When:** User (or regulator / Play / App Store) requests export or erasure; account deletion URL / in-app delete fails; DPDP/GDPR access request.

**Product paths**

| Action | API / UI |
|--------|----------|
| Export | `GET /vault/export` — Vault privacy actions (JSON share) |
| Hard-delete | `DELETE /vault` — wipes user DB rows + best-effort R2 keys (receipts, ingestion raw, avatar refs) |
| Revoke source | Consent center — `DELETE /ingestion/sources/:id` |
| Retention purge (ops) | `POST /admin/ingestion/retention/purge` — raw blobs past TTL only |

## SLAs

| Request type | Ack | Complete |
|--------------|-----|----------|
| Self-serve in-app export / delete | Immediate | Immediate (user-driven) |
| Support-assisted delete (user can’t auth) | 1 business day | **≤ 30 days** (target ≤ 7 days) |
| Regulator / store escalation | 1 business day | Per counsel; aim ≤ 30 days |
| “Delete my Gmail data only” | 1 business day | Disconnect source + confirm retention purge schedule |

Defaults for raw ingestion TTL (after parse): EMAIL **7d** · SMS **14d** · RECEIPT **30d** (`TRUST-RETENTION`).

## Triage

1. Verify identity (signed-in user id / email on account). Never delete on an unverified DM alone.
2. Prefer self-serve: guide Vault → Export, then Delete.
3. If delete already run: confirm 204 path; user should land logged out; tokens invalid.
4. If partial leftovers suspected: check storage keys, ingestion sources, and scheduled retention worker.

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
- Public deletion URL (when required) must describe the same Vault flow.

## Done when

- User confirms account gone **or** ticket closed with export+delete timestamps.
- No active ingestion sources for that user id.
- SLA met or exception logged with counsel.
