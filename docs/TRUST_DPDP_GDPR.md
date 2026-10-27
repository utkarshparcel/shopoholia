# TRUST-DPDP-GDPR — DPDP Act (India) + GDPR compliance checklist

> **Status:** engineering / product readiness packet (SHIPPED). This is **not** legal advice and **does not** invent counsel wet-ink. CI validates the packet + in-app data-dashboard links. Counsel review remains a **founder calendar** gate before real-money / broad EU GA (same pattern as `TRUST-CASA-TRACK`: packet in repo ≠ regulator approval).

## Related paths

| Artifact | Path |
|----------|------|
| Privacy policy **draft** (publishable after counsel) | [`docs/legal/PRIVACY_POLICY_DRAFT.md`](./legal/PRIVACY_POLICY_DRAFT.md) |
| Sub-processor / DPA checklist | this doc § Sub-processors |
| In-app data controls | Vault → Your data (`VaultPrivacyActions`); Consent center |
| Export / delete APIs | `GET /vault/export`, `DELETE /vault` (`TRUST-EXPORT-UI`) |
| Retention schedule | `apps/api/src/lib/retention.ts` (`TRUST-RETENTION`) |
| Limited Use / Gmail | [`docs/CASA.md`](./CASA.md) |
| Pentest readiness (no fake report) | [`docs/PENTEST_READINESS.md`](./PENTEST_READINESS.md) |

Public URL once published (set `EXPO_PUBLIC_PRIVACY_URL` / store listings):

- Suggested prod path: `https://worn.app/privacy` (or marketing site equivalent)
- Draft source of truth until then: `docs/legal/PRIVACY_POLICY_DRAFT.md`

## Counsel sign-off gate (founder — outside CI)

| # | Item | Owner | Status |
|---|------|-------|--------|
| 1 | Counsel reviews privacy policy draft + this checklist | Counsel | ☐ |
| 2 | Lawful basis map signed (consent / contract / legitimate interest per processing) | Counsel | ☐ |
| 3 | DPA / SCC language approved for sub-processors | Counsel | ☐ |
| 4 | Cross-border transfer notes (IN hosting ↔ EU/UK users if any) | Counsel | ☐ |
| 5 | Founder publishes privacy URL + links App Store / Play / OAuth | Founder | ☐ |
| 6 | In-app “Your data” links to privacy + export + delete live | Eng | ☑ |

**Do not invent counsel signatures or backdate this table.** CI never claims “signed.”

## India — Digital Personal Data Protection Act (DPDP) checklist

| # | Requirement | Product / eng evidence | Done |
|---|-------------|------------------------|------|
| D1 | Notice of purpose before processing | Consent copy; Limited Use bullets; onboarding | ☑ |
| D2 | Consent free, specific, informed, unambiguous; withdrawable | Consent center revoke; disconnect sources | ☑ |
| D3 | Purpose limitation (vault / found-money / outfits only) | Scope enums EMAIL/SMS/FINANCIAL/LIKENESS | ☑ |
| D4 | Data minimisation | Retention TTLs; parse then purge raw blobs | ☑ |
| D5 | Security safeguards | Secrets in env; signed R2 URLs; rate limits; pentest readiness | ☑ packet |
| D6 | Rights: access / correction / erasure | Export JSON; hard-delete; manual balance confirm | ☑ |
| D7 | Grievance / contact path | Privacy draft contact section | ☑ draft |
| D8 | Children’s data | Closet not directed at children; age gate TBD with counsel | ☐ counsel |
| D9 | Cross-border / significant data fiduciary duties | Counsel — after Soft launch volume | ☐ |

## EU / UK — GDPR (+ UK GDPR-adjacent) checklist

| # | Requirement | Product / eng evidence | Done |
|---|-------------|------------------------|------|
| G1 | Privacy policy public before EU/UK soft open | Draft path above; publish before invite | ☐ host URL |
| G2 | Lawful basis per processing activity | Counsel table (sign-off gate) | ☐ |
| G3 | Opt-in for non-essential analytics (no pre-ticked) | Analytics consent gate (GTM EU soft) | ☐ if GA4 |
| G4 | Data subject access (export) | `GET /vault/export` + mobile share | ☑ |
| G5 | Erasure | `DELETE /vault` + mobile confirm | ☑ |
| G6 | Restrict / object / portability | Export = portability; restrict TBD counsel | ☐ |
| G7 | Records of processing / RoPA | This checklist + sub-processor table | ☑ draft |
| G8 | DPIA if high-risk (inbox + financial) | Trigger before Gmail >100 / real-money GA | ☐ |
| G9 | Breach notification playbook | Ops — see pentest readiness incident section | ☐ |
| G10 | No Meta/ads to EU until consent + policy live | GTM rule | ☐ ops |

## Sub-processors / DPA checklist

Engage a DPA (or vendor terms that include GDPR Art. 28 / DPDP processor clauses) before production PII flows. Keep signed PDFs off-repo.

| Sub-processor | Purpose | Data | DPA status |
|---------------|---------|------|------------|
| Hosting (Fly/AWS/etc. — name when locked) | API + DB | Account, vault, ledger | ☐ |
| Cloudflare R2 (or equiv.) | Media / receipt blobs | Images under retention TTL | ☐ |
| Google (Gmail API) | Optional inbox ingest | Email metadata + parsed receipts | ☐ Limited Use + CASA |
| OCR provider (hosted when URL set) | Receipt / gift-card OCR | Image bytes transient | ☐ |
| Expo / push relay | Push notifications | Push token, event copy | ☐ |
| Sentry (if enabled) | Error monitoring | Stack traces; scrub PII | ☐ |
| Email / waitlist (Loops/beehiiv) | Marketing list | Email | ☐ |
| Analytics (GA4 / Plausible) | Product analytics | Pseudonymous events; consent-gated EU | ☐ |

## In-app data dashboard (product)

Reachable from Vault and Consent without digging:

1. **Privacy policy** — opens `EXPO_PUBLIC_PRIVACY_URL` (default `https://worn.app/privacy`)
2. **Consent** — connected sources, revoke, Limited Use (`/(closet)/consent`)
3. **Export my data** — `GET /vault/export` + share
4. **Delete my account** — `DELETE /vault`

Module: `apps/mobile/src/lib/privacyLinks.ts` · UI: `VaultPrivacyActions`.

## Soft-launch rule (EU / UK)

Invite-only English UI is fine **only if** export/delete work, privacy draft is linked, and non-essential analytics are opt-in. Soft launch ≠ GDPR exemption.

## Acceptance (engineering packet)

- [x] Privacy policy draft in repo
- [x] DPDP + GDPR checklist + DPA inventory
- [x] In-app data dashboard links
- [x] CI `pnpm check:dpdp-gdpr` (no fake counsel signature)
- [ ] Counsel wet-ink + published URL (founder — before real-money / broad EU GA)
