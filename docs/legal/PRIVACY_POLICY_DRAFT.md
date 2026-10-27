# WORN Closet — Privacy Policy (DRAFT)

> **Draft only.** Not legal advice and not published legal terms. Counsel must review and approve before this is served at a public URL or linked from App Store / Play / Google OAuth.
>
> Source path: `docs/legal/PRIVACY_POLICY_DRAFT.md`  
> Compliance checklist: [`docs/TRUST_DPDP_GDPR.md`](../TRUST_DPDP_GDPR.md)  
> Pentest readiness (no fake report): [`docs/PENTEST_READINESS.md`](../PENTEST_READINESS.md)  
> Suggested publish URL: `https://worn.app/privacy` (set `EXPO_PUBLIC_PRIVACY_URL` to match)  
> In-app: Vault / Consent → Your data (`VaultPrivacyActions`)

**Last updated (draft):** 2026-08-26  
**Controller / Data Fiduciary:** WORN / Shopoholia (legal entity name TBD — counsel)

## 1. Who we are

WORN Closet helps you find and use money you already paid for (gift cards, store credit, return windows, warranties) and manage your wardrobe. Contact for privacy: `privacy@worn.app` (placeholder — replace before publish).

## 2. What we collect

| Category | Examples | Why |
|----------|----------|-----|
| Account | Phone/email, display name, auth tokens | Sign-in, security |
| Vault money | Gift-card / store-credit balances, merchants, expiry | Found-money features |
| Purchases / returns | Order summaries, return deadlines | Reminders |
| Receipts / warranties | Photos, OCR text, coverage dates | Claims & archive |
| Wardrobe / outfits | Item photos, wear log, preferences | Outfits & waste insights |
| Connected sources (optional) | Gmail read-only sync status | Ingest receipts you already received |
| Device / push | Push token, app version | Notifications you allow |
| Diagnostics | Crash logs (PII scrubbed where possible) | Reliability |

We do **not** sell your personal data. We do **not** use Gmail content for ads or to train general AI/ML models (see Limited Use commitments in-app and `docs/CASA.md`).

## 3. Legal bases (GDPR) / consent (DPDP)

- **Consent** — connecting email/SMS, likeness, non-essential analytics, marketing.
- **Contract / service** — providing Vault, reminders, and Closet features you request.
- **Legitimate interests** (where applicable, counsel to confirm) — security, fraud prevention, product improvement with safeguards.

You may withdraw consent anytime in **Consent** or by deleting your account.

## 4. How we use data

- Surface gift cards, credits, returns, and warranties
- Send deadline and balance re-check reminders you enable
- Improve parsers and product reliability on **your** data for **your** benefit
- Comply with law and enforce security

## 5. Sharing

We share data only with processors who help run the service (hosting, storage, OCR, push, analytics — listed in `docs/TRUST_DPDP_GDPR.md`), or when required by law. Processors are bound by contracts / DPAs once executed.

## 6. Retention

Raw ingestion blobs are deleted after parse on a per-kind schedule (`TRUST-RETENTION`):

| Kind | TTL after parse |
|------|-----------------|
| EMAIL | **7d** |
| SMS | **14d** |
| RECEIPT | **30d** |

Redacted vault summaries may remain until you delete your account. Account and vault data remain until you delete (`DELETE /vault`) or as required for legal/security holds.

## 7. Your rights

Depending on where you live (India DPDP / EU-UK GDPR):

- Access / export your data (in-app **Export my data** → `GET /vault/export`)
- Delete your account and vault (in-app **Delete my account** → `DELETE /vault`)
- Withdraw consent and disconnect sources (Consent center)
- Open this policy from the in-app **Your data** card (privacy link)
- Correct inaccurate balances (manual re-check / confirm balance)
- Lodge a complaint with a supervisory authority (EU/UK) or grievance contact (IN)

## 8. Security (summary)

Encryption in transit (HTTPS). OAuth tokens encrypted at rest (AES-GCM) when Gmail is connected. Object storage uses signed-URL-only access where configured. Rate limits on auth and sensitive vault routes. Threat model / pentest readiness: [`docs/PENTEST_READINESS.md`](../PENTEST_READINESS.md) — **no fabricated third-party report** is claimed by this policy.

## 9. International transfers

If we process EU/UK data on infrastructure outside those regions, we will use appropriate safeguards (e.g. SCCs) as approved by counsel.

## 10. Children

WORN Closet is not directed at children. If you believe we collected a child’s data, contact us to delete it.

## 11. Changes

We will update this policy and revise the “Last updated” date. Material changes for EU/UK users may require renewed notice or consent.

## 12. Contact

Privacy: `privacy@worn.app` (placeholder)  
Grievance / DPO (if appointed): TBD by counsel

---

*End of draft. Do not present this file as an executed policy or counsel-signed terms.*
