# Google OAuth restricted-scope verification + CASA track (TRUST-CASA-TRACK)

WORN Closet uses **`gmail.readonly`** (Restricted scope) to find purchase/shipping receipts for the user’s vault. This doc is the **verification packet starter** and process checklist. It does **not** submit to Google, App Store, or Play — those stay manual with founder credentials.

> **Wave 1 rule:** No product feature may depend on CASA approval. Found-money aha ships via manual gift card / demo / SMS / receipt — Gmail is optional under the 100-user test cap until verification completes.

## Policy anchors

| Topic | Link |
|-------|------|
| Restricted scope verification | [Google restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) |
| Gmail scopes | [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) |
| Limited Use / User Data Policy | [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) |
| Workspace developer policy | [Workspace user data developer policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) |

## Scope (do not widen)

- **Requested:** `https://www.googleapis.com/auth/gmail.readonly`
- **Use:** read-only scan of purchase, shipping, gift-card, return, and warranty emails to populate the user’s private Vault
- **Not requested:** send, modify, settings, contacts, Drive, Calendar, or any non-Gmail Google API for this path
- **Server-side storage:** parsed vault summaries + raw ingestion blobs under retention TTLs (`TRUST-RETENTION`) → expect **annual CASA** after verification if Google requires it for this storage pattern

## Limited Use commitments (product + OAuth consent screen)

Use this copy on the Google Cloud OAuth consent screen **and** in-app (see `apps/mobile/src/lib/limitedUse.ts`):

1. **User benefit only** — Gmail access finds *your* gift cards, store credit, return windows, and warranties. Not sold to third parties.
2. **No ads** — inbox data is never used for advertising or ad personalization.
3. **No general AI/ML training** — we do not train general models on user inbox content.
4. **Human access** — no human reads mailbox content except with explicit user consent, for security/abuse investigation required by law, or as otherwise allowed under Limited Use.
5. **Transfer** — Gmail-derived data is not transferred to others except to provide/improve user-facing vault features the user requested, or with consent / legal requirement.
6. **Revoke + delete** — disconnect Gmail anytime; export and hard-delete via Vault (`TRUST-EXPORT-UI`).

### OAuth consent screen fields (draft)

| Field | Value |
|-------|--------|
| App name | WORN Closet |
| User support email | founder support inbox |
| App domain / privacy | Public privacy URL once live; until then this doc + in-app disclosures |
| Authorized domains | production API / app domains only |
| Scopes | `gmail.readonly` only |
| Short description | Find forgotten gift cards, store credit, and return deadlines from purchase emails — read-only. |
| Long description | WORN Closet scans purchase and shipping emails (read-only) to surface gift cards, store credit, return windows, and warranties you already paid for. We do not send email, change Gmail settings, use inbox data for ads, or train general ML models on your mail. You can revoke access and export or delete your data anytime. |

## Verification packet checklist (started — track status)

Mark items as you complete them in Google Cloud / Assessor flow. CI only checks that this checklist **exists** and Wave 1 stays Gmail-optional — it never fakes Google approval or store submit.

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | GCP project + OAuth client (iOS/Android/Web as needed) | Eng | ☐ |
| 2 | Consent screen: Limited Use long description (EN) above | Eng | ☐ |
| 3 | Privacy policy URL published (Limited Use section mirrors this doc) | Founder | ☐ |
| 4 | Homepage / app listing links match OAuth branding | Founder | ☐ |
| 5 | **Demo video (English)** recorded per script below | Founder | ☐ |
| 6 | Restricted scope verification submitted in GCP | Founder | ☐ |
| 7 | Test users reserved (≤100; keep ≤30 for GTM seats) | GTM | ☐ in flight / cap |
| 8 | CASA assessor engagement **only after** vault D7 retention + Gmail is proven unlock | Founder | ☐ blocked until D7 |
| 9 | Annual CASA renewal calendar once approved | Ops | ☐ N/A until approved |

## Demo video script (English) — ~2–3 min

Record screen-share **in English**. No PII of real customers; use a demo account.

1. **Cold open (10s):** “WORN Closet finds money you already paid for — gift cards and return windows — from purchase emails, read-only.”
2. **Consent (20s):** Open in-app Consent / Connect email. Show Limited Use bullets (purpose, no ads, revoke/delete). Tap Connect Gmail → Google consent.
3. **Scope (15s):** Zoom on Google screen: `gmail.readonly` / read-only mail. State: “We never request send or modify.”
4. **Happy path (45s):** After connect, show Vault found-money (or demo ₹/$ balance). Show a return deadline if present.
5. **Controls (30s):** Disconnect source from Consent; mention Vault export + hard-delete.
6. **Gmail-optional (20s):** Show onboarding Add card / demo path **without** Gmail — “Wave 1 works without inbox access.”
7. **Close (10s):** “Restricted scope · Limited Use · user-controlled.”

Store the recording privately (Drive/Notion). Link the URL in the verification form when submitting — **do not commit video binaries to git**.

## Wave 1 independence (must stay true)

| Product path | Requires CASA / verified Gmail? |
|--------------|----------------------------------|
| Onboarding manual gift card / demo ₹500 | No |
| SMS / receipt OCR ingest | No |
| Closet Today / wardrobe / accountant | No |
| Gmail OAuth connect | Optional; ≤100 test users until verified |

GTM calendar: `docs/GTM_ZERO_SPEND.md` Day 0 (privacy + Limited Use + verification in flight) and Day 14 (CASA spend only if Gmail is the bottleneck).

## CI hook (no Google submit, no store submit)

```bash
pnpm check:casa-track
# or: node scripts/check-casa-track.mjs
```

Validates this doc’s checklist coverage, in-app Limited Use module, GTM checklist pointers, and that Closet onboarding remains Gmail-optional. Does **not** call Google APIs, Assessor portals, or store submit.
