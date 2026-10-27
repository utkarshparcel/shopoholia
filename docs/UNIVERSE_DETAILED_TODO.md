# WORN Universe — Detailed Executable Backlog

> Master engineer backlog · synced 2026-08-26 from `UNIVERSE_ARCHITECTURE.md`, `UNIVERSE_DEV_PLAN.md`, `UNIVERSE_TODO.md`, `UNIVERSE_QA_REPORT.md` (esp. QA 2026-08-26), `GTM_ZERO_SPEND.md` product constraints, and gap canvas `universe-feature-gaps.canvas.tsx`.
>
> Companion (lighter checklist): [`UNIVERSE_TODO.md`](./UNIVERSE_TODO.md). **This file is the executable source of truth for sequencing.**
> Next usable+wow polish (100 tickets): [`UNIVERSE_WOW100.md`](./UNIVERSE_WOW100.md). Job-completing utility (50 tickets): [`UNIVERSE_USEFUL50.md`](./UNIVERSE_USEFUL50.md) — both additive; do not conflate with shipped Universe waves.
>
> Usable + wow polish: [`UNIVERSE_WOW100.md`](./UNIVERSE_WOW100.md). Job-completing utility: [`UNIVERSE_USEFUL50.md`](./UNIVERSE_USEFUL50.md) (`U001`–`U050`).
>
> **Legend** — priority `P0`–`P4` · Status `MISSING` | `PARTIAL` | `SHIPPED-NEEDS-POLISH` | `IN FLIGHT` · Est `S` (&lt;2d) | `M` (2–5d) | `L` (&gt;5d).
> `[ ]` only — do **not** mark `[x]` without verifying shipped code in-session.

---

## Suggested waves

| Wave | Theme | Calendar | Exit criteria (summary) |
|------|--------|----------|-------------------------|
| **0** | Parallel in-flight aha unblockers | **NOW** | Each W0 ticket merged or parked with owner; no silent half-landings |
| **1** | Unblock ahas (beta-ready Closet) | Next **2 weeks** | &lt;60s found-money without Gmail; live deadline pushes; OCR correctable; export/delete UI; mock Closet beta gate green |
| **2** | Habit flywheel | Weeks 3–6 | Morning reopen D7 ≥40% among vault-nonzero; laundry→outfit→wear-log loop; share cards ship |
| **3** | Social + occasions | Post habit | Family/friend loops + festival/wedding planners used in peak season dry-run |
| **4** | Marketplace / concierge / monetize | After retention | Fit/Gift/Disposition rails + RevenueCat; Gmail CASA only if non-Gmail retains |

### GTM sequencing constraints (product-facing)

From `GTM_ZERO_SPEND.md` — these **gate** Waves 1–2, not marketing fluff:

1. **Ship aha without public Gmail** (manual GC + receipt + Android SMS). Gmail stays ≤100-user test seats until D7 retention.
2. **Do not lead with Play try-on** creatives or Play-first onboarding.
3. **iOS: never market auto-SMS**; forwarding-address only.
4. **CASA / OAuth verification** is parallel compliance — do not block Wave 1 found-money on it.
5. **Paid UA / Apple $99 / CASA fees** blocked until vault D7 holds.

### Wave 0 conflict note (in-flight vs backlog)

Parallel agents are implementing W0 items **now**. Treat W0 IDs as ownership locks:

| In-flight cluster | Overlaps | Conflict rule |
|-------------------|----------|---------------|
| Live pushes + quiet hours | `NOTIF-*`, outfit 7am, return/GC/warranty nudges | Do not duplicate push delivery — extend W0 adapter |
| OCR real + manual correct | `WV03-OCR-*` | Wait for W0 OCR PR before new OCR UI |
| GC autofill | `WV02-AUTOFILL`, ingest GC parsers | Coordinate merchant parsers with autofill writer |
| Laundry / wear | `N04`, `N19` | Same schema (`laundry_status`); one PATCH API |
| Sync trust | `N45`, `N46` | One “what we read” feed surface |
| Vault UI (export/delete) | `TRUST-EXPORT-UI` | One mobile Trust tab |
| Onboarding aha | `ONB-60S-AHA` | Force path must stay Gmail-optional |
| Loyalty / coupon | `N07`, `N08` | Extend `money_accounts` kinds already in schema |

---

## Definition of done (lovable bar)

Reuse launch gate from `UNIVERSE_TODO.md`:

- [ ] Every user-facing screen has real content + loading/empty/error/offline — **no stubs shipped as done**
- [ ] Each module delivers its North-star aha within the first session
- [ ] Trust: granular revocable consent, export + hard-delete complete, money reconciled, security-reviewed before real-money GA
- [ ] Ingestion hits parser-accuracy target on real inboxes; wrong-number rate below gate
- [ ] Green CI (typecheck+lint+test), crash-free ≥99.5%, cold-start &lt;2s, a11y pass
- [ ] Analytics funnel + Sentry live — can answer “did found-money land?” with data
- [x] Legal: DPDP + GDPR packet + privacy draft + store Data Safety (`TRUST-DPDP-GDPR`, `REL-STORE-LISTINGS`); counsel wet-ink + OAuth verification still founder-gated

### Per-wave exit criteria

**Wave 0 exit**

- All W0 tickets either merged with vitest green or explicitly deferred with owner + replacement Wave-1 ID
- No second push/OCR/laundry implementation forked beside W0

**Wave 1 exit (mock Closet beta)**

- Time-to-nonzero-vault ≤60s without Gmail (manual GC path)
- Closet deadline pushes leave `QUEUED` → `SENT` (or documented Expo/FCM adapter) with quiet-hours honored
- Receipt OCR: confidence shown + manual correct saves; hosted path selectable via env
- Mobile: export download + hard-delete confirm → API round-trip
- QA residual: concurrent credit-add orphans cleaned; lint green; B4 still “mock-only OK” for this gate
- Analytics: install → found-money event visible in real sink (not console-only)

**Wave 2 exit**

- Wear-log rate measurable (photo or one-tap wore-it) ≥ target in beta cohort
- Laundry state affects `/outfits/today`; week calendar persists
- Shareable found-money + never-worn cards generate without PII leakage
- Package/refund ETA boards used by ≥1 cohort during haul week

**Wave 3 exit**

- ≥1 social loop (family share **or** ask-a-friend) ships with deep link
- Occasion planner (festival **or** interview kit) generates ≥2 outfits + reminder

**Wave 4 exit**

- Fit reorder **or** Gift “3 ideas in budget” works end-to-end on affiliate rails
- Disposition SELL/DONATE/BARTER creates real `sellers`/`listings` rows
- RevenueCat entitlement gates Accountant+Outfits premium surfaces
- Concierge lite (photo dump) ships before full human ops console

---

# Wave 0 — mostly SHIPPED (2026-08-26); do not fork completed tickets

## Notifications

- [x] **PUSH-LIVE-QUIET** · P0 · [Notifications] Deliver Closet deadline pushes + enforce quiet hours
  - Why: without SENT pushes, return/GC/warranty/outfit ahas never interrupt the day
  - Status: SHIPPED (2026-08-26) — `runClosetPushDelivery`: record `push_events` → Expo deliver; quiet hours delay via BullMQ; category opt-outs; deep links
  - Depends: none
  - Files: `packages/shared/src/closet-push-flow.ts`, `push-delivery.ts`, workers returns/expiry/gifts/wardrobe, `apps/api/src/lib/push/stub.ts`
  - Acceptance: met — shared push-delivery 13; workers returns 7 / expiry 11 / gifts 8 / wardrobe 7
  - Est: M

## WV-03 · OCR

- [x] **WV03-OCR-REAL** · P0 · [WV-03] Wire hosted OCR + confidence + manual-correct UI
  - Why: snap→filed is the warranty aha; mock OCR teaches wrong muscle memory
  - Status: SHIPPED (2026-08-26) — hosted when OCR_PROVIDER_URL set; confidence on create/confirm/list; PATCH + confirm corrections; vault badge + 0.7 gate with override
  - Depends: none
  - Files: `apps/api/src/lib/ocr/*`, `apps/api/src/routes/receipts.ts`, `apps/mobile/app/(closet)/vault.tsx` ReceiptsTab
  - Acceptance: met — vitest ocr 10, receipts 6, confidenceBadge 6, shared schemas 17
  - Est: M

## WV-02 · Gift cards

- [x] **WV02-AUTOFILL** · P0 · [WV-02] Auto-fill gift-card / store-credit balances from ingestion
  - Why: GTM aha scales past manual entry once inbox connects
  - Status: SHIPPED (2026-08-26) — `autofillCreditFromPurchase` idempotent by merchant+orderRef/doc id; `credit_autofilled` event
  - Depends: PUSH-LIVE-QUIET (expiry nudges)
  - Files: `services/worker-ingest/src/credit-autofill.ts`, `parsers/credit-detect.ts`, credits routes
  - Acceptance: met — worker-ingest credit-autofill + credits tests
  - Est: M

## Wardrobe ops (N04 / N19)

- [x] **N04-LAUNDRY-BASKET** · P0 · [Wardrobe] Laundry basket + clean/dirty/in-laundry toggle
  - Why: primary signal for morning generator; used every wash cycle
  - Status: SHIPPED (2026-08-26) — `laundry_status` + PATCH/DELETE; mobile laundry basket + toggles; outfits skip dirty
  - Depends: none
  - Files: migration `0015_laundry_wear_photo.sql`, wardrobe.ts, outfits.ts, wardrobe.tsx
  - Acceptance: met — wardrobe 8 + outfits 5 tests
  - Est: S

- [x] **N19-PHOTO-WEARLOG** · P0 · [Wardrobe] Photo wear-log (snap outfit → wear_log)
  - Why: highest-retention Closet signal; powers waste + accountant
  - Status: SHIPPED (2026-08-26) — `image_key` on wear_log; `POST /wear/photo` + optional imageKey on wear; today Attach photo
  - Depends: none
  - Files: same migration + today.tsx
  - Acceptance: met — wear+imageKey covered in wardrobe.test.ts
  - Est: S

## Ingest trust (N45 / N46)

- [x] **N45-SYNC-FEED** · P0 · [Ingest] “What we read last sync” transparency feed
  - Why: kills Gmail fear; users reopen after every sync
  - Status: SHIPPED (2026-08-26) — `GET /ingestion/activity` (+ sources reads); metrics “What we read”; no raw body/tokens
  - Depends: none
  - Files: `apps/api/src/routes/ingestion.ts`, metrics screen, ingestion activity helpers
  - Acceptance: met — ingestion-activity + ingestion route tests
  - Est: M

- [x] **N46-FIX-PARSE** · P0 · [Ingest] “Fix this parse” correction → purchase/credit update
  - Why: power users hit bad totals weekly; trains trust + future parsers
  - Status: SHIPPED (2026-08-26) — `POST /ingestion/documents/:id/correct`; purchase patch + audit + mobile Fix UI
  - Depends: N45-SYNC-FEED
  - Files: `apps/api/src/routes/ingestion.ts`, `services/worker-ingest/src/persistence.ts`, mobile sync feed UI
  - Acceptance:
    - `PATCH /ingestion/documents/:id` corrects merchant/total/items; updates linked purchase
    - Correction audited; vitest: wrong total → corrected ledger/purchase
  - Est: M
  - Note: Canonical path is `POST …/correct` (shipped); PATCH alias not required for acceptance of correction flow

## Trust / Vault UI

- [x] **TRUST-EXPORT-UI** · P0 · [Trust] Mobile export + hard-delete UI
  - Why: DPDP/GDPR visible control; GTM trust copy must match product
  - Status: SHIPPED (2026-08-26) — VaultPrivacyActions export JSON share + delete confirm → DELETE /vault → login
  - Depends: none
  - Files: `apps/mobile/src/components/VaultPrivacyActions.tsx`, vaultPrivacy hooks/client
  - Acceptance: met — vaultPrivacy + shareFile vitest; mobile suite 111 green
  - Est: S

## Onboarding

- [x] **ONB-60S-AHA** · P0 · [Onboarding] Force &lt;60s found-money path (no Gmail required)
  - Why: GTM Day-0 gate — manual card → “You have ₹/$X”
  - Status: SHIPPED (2026-08-26) — `/(closet)/onboarding` + demo ₹500 + celebration; `time_to_found_money`; vault empty no longer full-screens Connect-email-first (Gift tab owns aha; `assertsManualBeforeEmail`)
  - Depends: none (must stay independent of Gmail)
  - Files: `apps/mobile/app/(closet)/onboarding.tsx`, `firstDelight.ts`, `foundMoney.ts`, `vault.tsx`, credits `demo: true`
  - Acceptance: met — firstDelight + closet store + credits demo + Gmail-optional copy vitest
  - Est: M

## Recover money (N07 / N08)

- [x] **N07-LOYALTY-VAULT** · P1 · [Recover] Loyalty / brand-wallet vault (Myntra/Amazon Pay/Nykaa points)
  - Why: same aha as GC, higher frequency in India
  - Status: SHIPPED (2026-08-26) — `LOYALTY_POINTS` + vault Loyalty tab; `GET /credits?kind=`
  - Depends: WV02-AUTOFILL (shared money surface)
  - Files: migration `0014_money_account_kind_loyalty.sql`, credits routes, vault.tsx
  - Acceptance: met — credits create/list by kind; mobile hook kind filter
  - Est: M

- [x] **N08-COUPON-VAULT** · P1 · [Recover] Promo / coupon vault with expiry
  - Why: shoppers hoard codes; reuse expiry engine
  - Status: SHIPPED (2026-08-26) — `PROMO_CREDIT` + Coupons tab; expiry reminders kind-agnostic
  - Depends: PUSH-LIVE-QUIET
  - Files: same money surface as N07
  - Acceptance: met — schema + expiry tests
  - Est: S

---

# Wave 1 — Unblock ahas (next 2 weeks)

## Ingestion

- [x] **INGEST-SMS-ANDROID** · P1 · [Ingestion] Android native SMS adapter → `POST /ingestion/sms`
  - Why: GTM beachhead without Gmail; iOS stays forward-only
  - Status: SHIPPED (2026-08-26) — `createAndroidSmsInboxAdapter` + `WornSmsInbox`/`SmsAndroid` bridge; connect-email Sync SMS (Android) / forwarding copy (iOS); registered from `_layout`
  - Depends: none
  - Files: `apps/mobile/src/lib/sms.ts`, `smsAndroidAdapter.ts`, `smsNativeBridge.ts`, `apps/mobile/app.json` permissions, `apps/api/src/routes/ingestion.ts`
  - Acceptance: met — vitest adapter + native bridge mocks + iOS no-op / no READ_SMS marketing
  - Est: M

- [ ] **INGEST-GMAIL-E2E** · P1 · [Ingestion] Live inbox E2E proof (QA residual B4)
  - Why: make-or-break platform bet; unit mocks ≠ product magic
  - Status: **PARTIAL** (2026-08-26) — recorded-fixture E2E **hardened** (13 cases): bootstrap multi-merchant + promo filter, `history.list`/`messagesAdded`, expired-token refresh (+ refresh-fail keeps stale AT), history-404→list fallback, consent refuse, missing tokens, messages.get 404 skip, empty + legacy `history[].messages`, mute in fixture path, `processResync`+fixtures, list-503 empty; Amazon+Flipkart via `processIngestJob`. Spike ≥80% still CI. **Residual B4:** live Google inbox + restricted-scope verification **not** run (see `UNIVERSE_QA_REPORT` appendix B4). **Do not [x] until live staging checklist is done.**
  - Depends: none (keep ≤100 OAuth seats)
  - Files: `services/worker-ingest/src/e2e/gmail-fixture-e2e.test.ts`, `src/e2e/fixtures/gmail-recorded/`, `docs/UNIVERSE_QA_REPORT.md` appendix B4
  - Acceptance:
    - Documented staging run: connect test Gmail → ≥1 `merchant_purchases` row *(live — still open)*
    - Spike fixture threshold still ≥80% in CI
    - vitest unchanged green; manual checklist in `UNIVERSE_QA_REPORT` appendix
    - Recorded-fixture path green in CI *(met — not sufficient alone for [x])*
  - Est: M

- [x] **INGEST-ORPHAN-CLEANUP** · P1 · [Money] Concurrent credit-add orphan account cleanup
  - Why: QA residual — loser leaves zero-balance shells
  - Status: SHIPPED (2026-08-26) — `deleteOrphanMoneyAccount` + `purgeOrphanMoneyAccounts` (`@worn/db` + memory); credits race deletes shell, sweeps orphans, recovers missing-account mid-flight
  - Depends: none
  - Files: `packages/db/src/queries/money.ts`, `apps/api/src/routes/credits.ts`, `apps/api/src/lib/repositories/{types,memory,postgres}.ts`, `credits.test.ts`, `regression.test.ts`
  - Acceptance: met — concurrent / 5-way add → one funded account; purge unit + money.query vitest green
  - Est: S

## WV-02 · Gift cards

- [x] **WV02-BARCODE** · P1 · [WV-02] Barcode / photo capture of physical gift cards
  - Why: drawer cards never hit email — US/IN aha
  - Status: SHIPPED (2026-08-26) — `POST /credits/capture` + `/capture/photo` OCR prefill; capture meta on add; vault Scan/Photo
  - Depends: WV03-OCR-REAL (reuse OCR) or lightweight barcode lib
  - Files: `packages/shared/src/giftCardCapture.ts`, `apps/mobile/app/(closet)/vault.tsx`, `apps/api/src/routes/credits.ts`
  - Acceptance: met — scan/photo prefills merchant + last4/code; API accepts capture; vitest capture + hook smoke
  - Est: M

- [x] **WV02-USE-NOW** · P1 · [WV-02] “Use it now” → merchant deep-link / affiliate
  - Why: converts found money into action (Flipkart/Amazon affiliate rails)
  - Status: SHIPPED (2026-08-26) — `merchantDeepLink` + vault Use it now + `link` on GET /credits
  - Depends: none
  - Files: `packages/shared/src/merchantDeepLink.ts`, vault.tsx, credits.ts
  - Acceptance: met — shared deep-link tests + credits list `link`
  - Est: S

## WV-03 · Warranty

- [x] **WV03-CLAIM-RAIL** · P1 · [WV-03] One-tap warranty claim (prefilled email / deep-link)
  - Why: claim must feel real, not a state flip
  - Status: SHIPPED (2026-08-26) — `buildWarrantyClaimUrl` + `claimUrl`/`orderRef` on claim; mobile opens mailto/deep-link
  - Depends: WV03-OCR-REAL
  - Files: `packages/shared/src/warrantyClaim.ts`, `apps/api/src/routes/receipts.ts`, vault WarrantiesTab
  - Acceptance: met — mailto/deep-link with merchant + order refs; state → CLAIMED; vitest claim + audit
  - Est: S

- [x] **WV03-SNOOZE-CATS** · P2 · [WV-03] Expiry snooze + category coverage polish
  - Why: reminders that fire once and die train dismissals
  - Status: SHIPPED (2026-08-26) — snooze endpoint + stable jobId; electronics/appliances/apparel presets
  - Depends: PUSH-LIVE-QUIET
  - Files: warranties schema/API, `apps/api/src/lib/expiry.ts`, worker-expiry, mobile
  - Acceptance: met — snooze delay > now; category presets; vitest snooze + claim URL builder
  - Est: S

## WV-01 · Returns

- [x] **WV01-MOBILE-UNIFY** · P1 · [WV-01] Unify `returns.tsx` with Vault Returns tab + live countdown
  - Why: orphaned screens break the “3 days left” aha
  - Status: DONE — Vault Returns tab + `ReturnsPanel`; `returns.tsx` → `vault?focus=returns`; live countdown + status timeline
  - Depends: none
  - Files: `apps/mobile/app/(closet)/returns.tsx`, `apps/mobile/app/(closet)/vault.tsx`, `apps/mobile/src/components/ReturnsPanel.tsx`, `apps/mobile/src/lib/returnCountdown.ts`, `apps/mobile/src/lib/returnTimeline.ts`
  - Acceptance:
    - Single source of truth UI; countdown matches API `windowDeadline`
    - Status timeline visible; vitest: countdown + timeline helpers
  - Est: S

- [x] **WV01-REFUND-LEDGER-UI** · P1 · [WV-01] Mobile refund confirm → `money_ledger` visible in Vault
  - Why: “refund landed” closes the recover loop
  - Status: DONE — Mark refunded → money_ledger; Vault “Refund ledger”; returns.test + mobile hook/panel tests
  - Depends: WV01-MOBILE-UNIFY
  - Files: `apps/api/src/routes/returns.ts`, `apps/api/src/lib/return-jobs.ts`, mobile ReturnsPanel / markReturnRefunded
  - Acceptance:
    - User marks refunded → CASH/STORE_CREDIT ledger entry; Vault shows it
    - vitest: returns.test refund path (+ accountant ledger)
  - Est: S

## WV-04 · Outfits

- [x] **WV04-7AM-PUSH** · P1 · [WV-04] Daily 7am “your outfit today” push (avatar deep link)
  - Why: retention engine headline
  - Status: SHIPPED (2026-08-26) — TZ-aware `scheduleMorningOutfit` (~7am local), idempotent `outfit:{userId}:{YYYY-MM-DD}` jobId; worker delivers `worn://today`; quiet hours in worker-wardrobe
  - Depends: PUSH-LIVE-QUIET, N04-LAUNDRY-BASKET
  - Files: `apps/api/src/lib/wardrobe-jobs.ts`, `services/worker-wardrobe/*`, mobile today
  - Acceptance:
    - Scheduled job per user TZ (~7am) delivers push with `worn://today`
    - vitest: schedule idempotent jobId; quiet hours respected
  - Est: M

- [x] **WV04-SWIPE-ALT** · P2 · [WV-04] Swipe alternatives on Today
  - Why: one outfit feels brittle; swipe builds habit
  - Status: SHIPPED (2026-08-26) — `GET /outfits/today?alt=` ranked slices; `POST /outfits/today/select` commits; mobile Next/Prev + Use this look
  - Depends: WV04-7AM-PUSH
  - Files: `apps/api/src/routes/outfits.ts`, `apps/api/src/lib/outfit-rank.ts`, `apps/mobile/app/(closet)/today.tsx`
  - Acceptance:
    - `GET /outfits/today?alt=` or next-alt returns ranked alternatives excluding worn-blocked pieces
    - Mobile swipe commits selection; vitest: ranking stable
  - Est: M

- [x] **WV04-BULK-IMPORT** · P2 · [WV-04] Bulk closet import (photos + ingested purchases auto-add)
  - Why: empty wardrobe kills morning ritual
  - Status: SHIPPED (2026-08-26) — `POST /wardrobe/bulk`, `GET /wardrobe/importable-purchases`, `POST /wardrobe/from-purchases`; mobile multi-photo + Add from purchases
  - Depends: none
  - Files: `apps/api/src/routes/wardrobe.ts`, mobile wardrobe, ingest→wardrobe hook
  - Acceptance:
    - Multi-photo upload creates N items; purchase items can “Add to wardrobe”
    - vitest: batch create
  - Est: M

## WV-05 · Waste

- [x] **WV05-SHARE-CARD** · P1 · [WV-05] Shareable “₹/$X never worn” card
  - Why: GTM viral proof without inbox; watermarked blur
  - Status: DONE
  - Depends: none
  - Files: `apps/mobile` waste UI, `apps/api/src/routes/waste.ts`, `apps/mobile/src/lib/wasteMoney.ts`, `packages/shared/src/waste.ts`
  - Acceptance:
    - Share sheet image/text with blurred merchants + total; no card numbers
    - vitest: amount formatter + redact helper
  - Est: S

- [x] **WV05-WEAR3-CHALLENGE** · P2 · [WV-05] “Wear it 3×” challenge nudge
  - Why: turns dead inventory into habit before dispose
  - Status: DONE
  - Depends: N19-PHOTO-WEARLOG
  - Files: waste routes, push, mobile wardrobe
  - Acceptance:
    - Dead/dormant item offers challenge; progress 0/3 → celebrate; vitest: progress counter
  - Est: S

## WV-08 · Accountant

- [x] **WV08-CSV-UI** · P1 · [WV-08] Accountant CSV export button on mobile
  - Why: API exists (`fetchAccountantExportCsv`); screen never exposes it
  - Status: SHIPPED (2026-08-26) — Export CSV on accountant via `useExportAccountantCsv` + share
  - Depends: none
  - Files: `apps/mobile/app/(closet)/accountant.tsx`, vaultPrivacy hooks
  - Acceptance: met — vaultPrivacy CSV tests in mobile suite
  - Est: S

- [x] **WV08-PLAY-BUDGET-NUDGE** · P2 · [WV-08] Budget nudge at Play checkout
  - Why: sanctioned ledger→fantasy bridge (spend awareness)
  - Status: DONE
  - Depends: none
  - Files: `apps/api/src/lib/orders/checkout.ts`, `apps/api/src/lib/budget.ts`, `apps/mobile/app/checkout.tsx`, `apps/api/src/routes/bridge.test.ts`
  - Acceptance:
    - Over-budget category shows soft nudge (not hard block) at checkout
    - vitest: nudge payload when exceeded
  - Est: M

## Trust / compliance

- [x] **TRUST-RETENTION** · P0 · [Trust] Per-data-type retention schedule (delete raw docs after parse)
  - Why: Limited Use + DPDP minimization; Gmail policy
  - Status: DONE
  - Depends: none
  - Files: `services/worker-ingest`, `apps/api/src/lib/retention.ts`, R2 deletes
  - Acceptance:
    - Job deletes raw `ingestion_documents` blobs past TTL after MATCHED; DB row retains redacted summary
    - vitest: `retention.test.ts`
  - Est: M
  - Done: Per-kind schedule EMAIL 7d / SMS 14d / RECEIPT 30d (+ env overrides); purge keeps parse status; `purgedByKind` on admin result; worker-ingest `retention-schedule` mirrors TTLs

- [x] **TRUST-CASA-TRACK** · P1 · [Trust] Google OAuth restricted-scope verification + CASA track
  - Why: hard blocker for &gt;100 Gmail users; parallel to product
  - Status: SHIPPED (2026-08-26) — verification packet + EN demo-video script in `docs/CASA.md`; in-app Limited Use on consent/connect-email; CI `check-casa-track` (no Google/store submit); Wave 1 stays Gmail-optional
  - Depends: TRUST-EXPORT-UI, TRUST-RETENTION, Limited Use copy
  - Files: `docs/CASA.md`, `docs/GTM_ZERO_SPEND.md`, `apps/mobile/src/lib/limitedUse.ts`, connect-email/consent, `scripts/check-casa-track.mjs`, CI
  - Acceptance: met — packet started; demo video EN script; Limited Use disclosures in-app; no Wave 1 feature gated on CASA
  - Est: L (calendar-bound)

- [x] **TRUST-CONSENT-CENTER** · P1 · [Trust] Consent center shows connected sources + revoke
  - Why: Decision #4 trust bar; M9 residual
  - Status: DONE
  - Depends: none
  - Files: `apps/mobile/app/(closet)/consent.tsx`, `connect-email.tsx`, vault
  - Acceptance:
    - Lists email/SMS/financial grants; revoke calls API; connect-email reachable under Closet flag
    - vitest/mobile: consent hooks
  - Est: S
  - Done: Connected sources + last sync + disconnect via DELETE /ingestion/sources/:id; `consentCenter.ts` list helpers + tests; revoke EMAIL disconnects sources

## UX / Onboarding polish

- [x] **ONB-PROGRESSIVE-PERMS** · P1 · [Onboarding] Progressive permissions (email/notifications in context)
  - Why: upfront permission walls kill &lt;60s aha
  - Status: SHIPPED (2026-08-26) — email after found-money; notifications on first deadline; Skip always available
  - Depends: ONB-60S-AHA
  - Files: `apps/mobile/src/lib/progressivePerms.ts`, `pushPermission.ts`, `ProgressivePermPrompt.tsx`, vault/returns/connect-email wiring
  - Acceptance: met — vitest flag sequencing + store + pushPermission stub; prompts gated after aha / on deadline
  - Est: S

- [x] **UX-SKELETONS-OFFLINE** · P1 · [UX] Loading skeletons, empty, error, offline, pull-to-refresh on Closet screens
  - Why: lovable bar — no blank stubs
  - Status: SHIPPED (2026-08-26) — ClosetScreen states kit (skeleton/empty/error/PTR + NetInfo offline banner); today/wardrobe/vault/accountant wired; `closetScreenState` helpers + vitest
  - Depends: none
  - Files: `apps/mobile/src/components/ClosetScreen.tsx`, `apps/mobile/src/lib/closetScreenState.ts`, `apps/mobile/src/hooks/closet/useNetworkStatus.ts`, `apps/mobile/app/(closet)/{today,wardrobe,vault,accountant}.tsx`
  - Acceptance: met — skeleton+empty+error+PTR on four screens; offline via `@react-native-community/netinfo`; vitest closetScreenState + useNetworkStatus
  - Est: M

## Observability / release

- [x] **OBS-ANALYTICS-SINK** · P1 · [Obs] Real analytics sink (PostHog/webhook) end-to-end funnel
  - Why: cannot answer “did found-money land?” on console.info
  - Status: SHIPPED (2026-08-26) — HTTP webhook/PostHog sink + PII scrub; mobile/api init from env; Closet funnel events
  - Depends: none
  - Files: `apps/mobile/src/lib/analytics.ts`, `apps/api` server analytics, `packages/shared/src/analytics.ts`
  - Acceptance: met — vitest sink selection + sanitizeAnalyticsProperties (no PII); CLOSET_FUNNEL_EVENTS
  - Est: S

- [x] **OBS-SENTRY-CLOSET** · P1 · [Obs] Sentry wired Closet-wide (app + api + workers)
  - Why: crash-free gate before store
  - Status: SHIPPED (2026-08-26) — Closet surface tags; ClosetScreen error capture; BullMQ failed→Sentry on Closet workers; smoke via SENTRY_SMOKE
  - Files: mobile Sentry, workers, api, `packages/shared/src/node-sentry.ts`
  - Acceptance: met — vitest tags/smoke/capture; workers attach failure reporting
  - Est: S

- [x] **REL-EAS-GATES** · P1 · [Release] EAS preview/prod + OTA strategy + crash-free gate
  - Why: GTM closed testing / TestFlight need repeatable builds
  - Status: SHIPPED (2026-08-26) — `docs/EAS.md` preview/OTA/staged + crash-free ≥99.5% checklist; `runtimeVersion` in app.json; CI `scripts/check-eas-gates.mjs` (no store submit)
  - Depends: OBS-SENTRY-CLOSET
  - Files: `apps/mobile/eas.json`, `apps/mobile/app.json`, `docs/EAS.md`, `scripts/check-eas-gates.mjs`, `.github/workflows/ci.yml`
  - Acceptance: met — documented preview + OTA + staged rollout + crash-free gate; CI validates profiles/docs without eas submit
  - Est: M

- [x] **INGEST-LINT-CI** · P0 · [Platform] Lint green + residual SMMS→SMS / style debt if still red
  - Why: QA residual can fail CI gate
  - Status: SHIPPED (2026-08-26) — `pnpm lint` + `pnpm typecheck` green; SMMS→SMS via migration 0012
  - Depends: none
  - Files: `apps/api`, enums migrations
  - Acceptance: `pnpm lint` + typecheck green on PR; vitest unaffected
  - Est: S

---

# Wave 2 — Habit flywheel

## Today ritual (net-new)

- [x] **N01-WEEK-CAL** · P2 · [Today] Week outfit calendar (Mon–Sun)
  - Why: plan week from clean wardrobe; reopen every morning
  - Status: SHIPPED (2026-08-26) — `planned_for` on outfits; `GET /outfits/week` + generate/patch; today Mon–Sun strip
  - Depends: N04-LAUNDRY-BASKET, WV04-SWIPE-ALT
  - Files: migration `0018_outfit_week_calendar.sql`, outfits.ts, today.tsx
  - Acceptance: met — week CRUD vitest in outfits.test.ts
  - Est: M

- [x] **N02-AVOID-REPEAT** · P2 · [Today] Avoid-repeat this week
  - Why: block outfits reusing pieces worn in last N days
  - Status: SHIPPED (2026-08-26) — default 7-day exclusion + whyThis; falls back if pool empty
  - Depends: N19-PHOTO-WEARLOG
  - Files: `outfit-avoid-repeat.ts`, outfits.ts ranking
  - Acceptance: met — unit + outfits integration exclusion tests
  - Est: S

- [x] **N03-CAL-EVENT-OUTFIT** · P2 · [Today] Calendar event → outfit
  - Why: interview/wedding/office from device calendar
  - Status: SHIPPED (2026-08-26) — title/time → occasion; `POST /outfits/from-calendar`; optional night-before reminder; Today “From calendar”
  - Depends: N01-WEEK-CAL
  - Files: `packages/shared/src/cal-event-outfit.ts`, `apps/api/src/lib/cal-event-outfit.ts`, outfits.ts, calendarPermission + deviceCalendar, today.tsx
  - Acceptance: met — occasion mapping helper vitest (shared+api) + from-calendar route test; night-before optional
  - Est: M

- [x] **N05-WHAT-GOES-WITH** · P2 · [Today] “What goes with this?” item → ranked matches
  - Why: tap any item → compatible owned pieces
  - Status: SHIPPED (2026-08-26) — `GET /wardrobe/:id/goes-with` ranked by slot + color
  - Depends: wardrobe graph
  - Files: `outfit-goes-with.ts`, wardrobe.ts
  - Acceptance: met — category pairing unit tests + route vitest (alias of /pairs)
  - Est: M

- [x] **N06-WEATHER-REROLL** · P2 · [Today] Weather change re-roll before noon
  - Why: forecast shifts invalidate morning pick
  - Status: SHIPPED (2026-08-26) — threshold helper + `/outfits/today` re-roll + quiet push
  - Depends: WV04-7AM-PUSH
  - Files: `weather-reroll.ts`, outfits.ts, weather.ts
  - Acceptance: met — threshold helper + today re-roll vitest
  - Est: S

## Recover money (net-new)

- [x] **N09-PACKAGE-TRACK** · P2 · [Recover] Package & delivery tracker
  - Why: daily opens during hauls; bridges ingest → wardrobe arrival
  - Status: SHIPPED
  - Depends: INGEST parsers shipping
  - Files: purchases schema status, mobile vault/today, ingest parsers
  - Acceptance:
    - List in-transit purchases with ETA; mark delivered → suggest wardrobe add
    - vitest: state transitions
  - Est: M

- [x] **N10-EXCHANGE-WINDOW** · P2 · [Recover] Exchange window tracker (≠ returns)
  - Why: size misses use exchange more than refund
  - Status: SHIPPED
  - Depends: WV01-MOBILE-UNIFY
  - Files: returns or new exchange entity, mobile
  - Acceptance:
    - Separate exchange deadline + CTA; vitest: window ≠ return window when merchant differs
  - Est: M

- [x] **N16-REFUND-ETA** · P2 · [Recover] Refund ETA board until ledger credit
  - Why: post-return anxiety; closes money loop
  - Status: SHIPPED (2026-08-26) — `GET /returns/refund-eta` board INITIATED→CONFIRMED→REFUNDED + ETA guess; `ledgerCredited` via money_ledger; ReturnsPanel board; vitest board query
  - Depends: WV01-REFUND-LEDGER-UI
  - Files: returns + money_ledger, mobile
  - Acceptance:
    - Board shows INITIATED→…→REFUNDED with ETA guess; lands in ledger
    - vitest: board query
  - Est: M

- [x] **N11-DUP-REBUY** · P2 · [Recover] Duplicate / rebuy detector
  - Why: block “I already own this” at Play checkout + ingest
  - Status: SHIPPED
  - Depends: wardrobe + purchases graph
  - Files: checkout, ingest, wardrobe match
  - Acceptance:
    - Similarity match warns at Play checkout and on ingest; vitest: title/brand match
  - Est: M

- [x] **N18-GST-INVOICE** · P2 · [Recover] GST / invoice archive search
  - Why: India returns & warranties need invoices constantly
  - Status: SHIPPED (2026-08-26) — `GET /receipts?merchant&from&to&gstin`; `GET /receipts/:id/export?format=image|pdf`; vault search + export
  - Depends: receipts vault
  - Files: receipts search API, mobile vault
  - Acceptance:
    - Search merchant/date/GSTIN; export PDF/image; vitest: search filters
  - Est: M

## Wardrobe ops (net-new)

- [x] **N20-CARE-OCR** · P2 · [Wardrobe] Care / wash-label OCR
  - Why: drives laundry + damage claims
  - Status: SHIPPED (2026-08-26) — `parseCareLabel` fixtures; `POST /wardrobe/:id/care-ocr` (+ `/photo` multipart); careRules on item; mobile Snap care tag
  - Depends: WV03-OCR-REAL
  - Files: `packages/shared/src/careLabel.ts`, wardrobe schema/migration `0022_care_dryclean.sql`, wardrobe routes, OCR mock care fixtures, mobile wardrobe
  - Acceptance: met — snap/OCR → care rules on item; vitest careLabel fixtures + care-ocr route
  - Est: M

- [x] **N22-DRYCLEAN-TRACK** · P2 · [Wardrobe] Dry-clean ticket tracker
  - Why: metro India frequency; pickup dates
  - Status: SHIPPED (2026-08-26) — ticket+pickup → IN_LAUNDRY → CLEAN on confirm; day-of BullMQ push (`dry-clean-pickup`); mobile Dry clean / Picked up
  - Depends: N04-LAUNDRY-BASKET
  - Files: `dry-clean.ts`, `dry-clean-jobs.ts`, `services/worker-wardrobe` dry-clean consumer, wardrobe routes, mobile wardrobe
  - Acceptance: met — vitest state machine + schedule/process + worker + wardrobe route
  - Est: S

- [x] **N23-SEASONAL-SWAP** · P2 · [Wardrobe] Seasonal closet swap
  - Why: India winter/summer ritual — huge reopen
  - Status: SHIPPED (2026-08-26) — `closet_status` ACTIVE/STORED + season:* tags; `POST /wardrobe/seasonal-swap`; today generator `preferActiveCloset`; wardrobe Summer/Winter/Monsoon swap
  - Depends: wardrobe
  - Files: `apps/api/src/lib/seasonal-swap.ts`, migration `0020_wardrobe_seasonal_tags.sql`, wardrobe routes, outfits generate, `apps/mobile/app/(closet)/wardrobe.tsx`
  - Acceptance: met — bulk ACTIVE/STORED by season; today prefers active; vitest filter + route
  - Est: M

- [x] **N24-TRAVEL-PACK** · P2 · [Wardrobe] Travel packing from wardrobe
  - Why: trip dates → capsule + weather
  - Status: SHIPPED (2026-08-26) — `POST /outfits/travel-pack` capsule from owned ACTIVE items + weather; markdown checklist export/share
  - Depends: N01-WEEK-CAL, weather
  - Files: `apps/api/src/lib/travel-pack.ts`, outfits routes, `useTravelPack` + today Travel pack CTA
  - Acceptance: met — trip dates → packing list; checklist export; vitest capsule size + route
  - Est: M

- [x] **N28-WORKWEAR-ROTATION** · P2 · [Wardrobe] Workwear / uniform rotation
  - Why: weekday reopen habit
  - Status: SHIPPED (2026-08-26) — `POST /outfits/week/workwear` Mon–Fri WORK outfits from workwear-tagged items; unique rotation when pool allows
  - Depends: N01-WEEK-CAL, N02-AVOID-REPEAT
  - Files: `apps/api/src/lib/workwear-rotation.ts`, outfits routes, `useWorkwearRotation` + today Workwear week CTA
  - Acceptance: met — weekday auto-plan occasion WORK; vitest rotation uniqueness + route
  - Est: S

- [x] **N29-SHOE-BAG-ROT** · P2 · [Wardrobe] Shoe & bag rotation
  - Why: prevents overwear; daily for many
  - Status: SHIPPED (2026-08-26) — `GET /wardrobe/rotation`; least-worn shoes/bags from wear_log; Closet wardrobe panel
  - Depends: N19-PHOTO-WEARLOG
  - Files: `apps/api/src/lib/shoe-bag-rotation.ts`, wardrobe routes, `useShoeBagRotation`, `apps/mobile/app/(closet)/wardrobe.tsx`
  - Acceptance: met — category filter + rotation vitest; route filters shoes/bags
  - Est: S

- [x] **N30-ACCESSORIES** · P2 · [Wardrobe] Accessories / jewelry vault
  - Why: completes morning ritual outfits
  - Status: SHIPPED (2026-08-26) — jewelry category normalize; attach to today outfit; wear_log expands via itemIds
  - Depends: wardrobe categories
  - Files: `apps/api/src/lib/outfit-accessories.ts`, outfits generator, wardrobe create, `apps/mobile/src/lib/accessories.ts`
  - Acceptance: met — create category + attach + wear_log expansion vitest
  - Est: S

- [x] **N31-MISSING-PIECE** · P2 · [Wardrobe] Missing-piece detector → shopping list
  - Why: “need black trousers for 4 tops”
  - Status: SHIPPED (2026-08-26) — `GET /wardrobe/missing-pieces` gap heuristic + affiliate URLs; Closet shop CTAs
  - Depends: N05-WHAT-GOES-WITH
  - Files: `apps/api/src/lib/missing-piece.ts`, wardrobe routes, `useMissingPieces`, `apps/mobile/app/(closet)/wardrobe.tsx`
  - Acceptance: met — gap heuristic + affiliate suggestion vitest
  - Est: M

- [x] **N32-CAPSULE** · P2 · [Wardrobe] Capsule builder (N-item)
  - Why: weekly planning sessions
  - Status: DONE (2026-08-26) — `PUT/GET /wardrobe/capsule` via consentFlags; outfit generator prefers membership
  - Depends: N01-WEEK-CAL
  - Files: `apps/api/src/lib/capsule.ts`, outfits.ts, wardrobe.ts, mobile client
  - Acceptance: met — vitest membership + generator prefer in capsule-bridge.test.ts
  - Est: M

## Anti-impulse / bridges

- [x] **N33-PREBUY-FIT** · P2 · [Anti-impulse] Pre-buy wardrobe fit check at Play
  - Why: overlaps, gaps, budget, returns risk before purchase
  - Status: DONE
  - Depends: N11-DUP-REBUY, WV08 budgets
  - Files: `apps/api/src/lib/prebuy-fit.ts`, `apps/api/src/routes/bridge.ts`, `apps/mobile/app/checkout.tsx`, `apps/api/src/routes/bridge.test.ts`
  - Acceptance:
    - CTA “Check my closet” shows overlap/gap/budget; vitest: score fixture
  - Est: M

- [x] **N34-COOLING-OFF** · P2 · [Anti-impulse] Cooling-off cart hold (24h over budget)
  - Why: interrupts fashion impulse before checkout regret
  - Status: DONE
  - Depends: WV08-PLAY-BUDGET-NUDGE
  - Files: `apps/api/src/lib/cooling-off.ts`, `apps/api/src/lib/cooling-off-jobs.ts`, `apps/api/src/lib/orders/checkout.ts`, `apps/api/src/routes/cart.ts`, `apps/mobile/app/checkout.tsx`, `apps/mobile/app/cart.tsx`
  - Acceptance:
    - When cart apparel total exceeds budget, hold purchase 24h (soft lock + notify when released)
    - User can override with confirm; vitest: hold window + release job
  - Est: M

- [x] **N50-TRACK-PLAY-BUY** · P1 · [Bridge] Track this Play buy in Closet
  - Why: sanctioned bridge; seeds `merchant_purchases` every order
  - Status: DONE
  - Depends: none
  - Files: `apps/api/src/lib/track-play-buy.ts`, `apps/api/src/routes/orders.ts`, `apps/api/src/routes/bridge.ts`, `apps/mobile/app/order/[id].tsx`
  - Acceptance:
    - Post-checkout CTA creates purchase + optional wardrobe items; vitest: create from order id
  - Est: S

- [x] **N51-REPLACE-TWIN** · P2 · [Bridge] Replace worn-out twin via affiliate
  - Why: dead item → similar listing
  - Status: DONE (2026-08-26) — `GET /waste/:id/replace-twins` + click → cashback_events
  - Depends: WV05 dispose / waste
  - Files: `apps/api/src/lib/replace-twin.ts`, waste.ts, mobile client
  - Acceptance: met — vitest match query + cashback click in capsule-bridge.test.ts
  - Est: M

- [x] **N52-COMPLETE-LOOK** · P2 · [Bridge] Complete-the-look from owned + missing affiliate
  - Why: owned base + buy gap piece
  - Status: DONE (2026-08-26) — `GET /outfits/complete-look` owned slots + affiliate fills
  - Depends: N31-MISSING-PIECE
  - Files: `apps/api/src/lib/complete-look.ts`, outfits.ts, mobile client
  - Acceptance: met — vitest slot builder in complete-look.test.ts + route
  - Est: M

## Accountant habit / sustainability / share

- [x] **N41-CPW-GOALS** · P2 · [Accountant] Cost-per-wear goals per item
  - Why: nudge wear until target CPW
  - Status: SHIPPED (2026-08-26) — `target_cpw_minor` on `item_metrics`; `POST /accountant/items/:id/cpw-goal` + `GET /accountant/cpw-goals` + summary; `CPW_GOAL` push; waste summary exposes `targetCpwMinor`/`cpwGoal`; wardrobe set-goal + accountant progress; vitest goal math + route
  - Depends: wear_log + prices
  - Files: `packages/shared/src/cpw-goals.ts`, `apps/api/src/routes/accountant.ts`, `apps/api/src/routes/waste.ts`, `apps/mobile/app/(closet)/wardrobe.tsx`, `apps/mobile/app/(closet)/accountant.tsx`
  - Acceptance: met — Set target CPW; progress nudge; vitest: goal math + route
  - Est: S

- [x] **N42-SPEND-ENVELOPES** · P2 · [Accountant] Category spend envelopes + mid-month alerts
  - Why: apparel caps with alerts (extends budgets)
  - Status: SHIPPED (2026-08-26) — 80% mid-period WARN + once-per-period `SPEND_ENVELOPE` push (quiet hours); summary `envelopeStatus`/`alertThresholdHit`; accountant UI banner; vitest threshold + route
  - Depends: PUSH-LIVE-QUIET, WV08-PLAY-BUDGET-NUDGE
  - Files: `apps/api/src/lib/budget.ts`, `apps/api/src/routes/accountant.ts`, `packages/shared` push deep link + accountant schema, mobile accountant
  - Acceptance: met — Mid-period alert at 80%; vitest threshold + route WARN/push
  - Est: S

- [x] **N43-ROI-SEASON** · P2 · [Accountant] Wardrobe ROI by season
  - Why: what earned wears vs sat dead
  - Status: SHIPPED (2026-08-26) — India Summer/Monsoon/Winter aggregation; `GET /accountant/roi/season`; Closet accountant section; vitest aggregation + route
  - Depends: N23-SEASONAL-SWAP, item_metrics
  - Files: `apps/api/src/lib/roi-season.ts`, accountant routes/schemas, mobile accountant
  - Acceptance: met — season report wears vs cost (worn/idle); vitest aggregation + route
  - Est: M

- [x] **N53-REWEAR-STREAK** · P2 · [Sustainability] Rewear streak
  - Why: sticky habit before new buy
  - Status: SHIPPED (2026-08-26) — `computeRewearStreak` consecutive wear_log days + optional purchase break; `GET /waste/rewear-streak` + summary field; milestone push; Today/Wardrobe UI
  - Depends: N19-PHOTO-WEARLOG
  - Files: `packages/shared/src/rewear-streak.ts`, `apps/api/src/lib/rewear-streak.ts`, waste/wardrobe routes, mobile Today + wardrobe
  - Acceptance: met — vitest streak counter (shared + waste route); breakOnPurchase optional
  - Est: S

- [x] **N54-DECLUTTER-CHALLENGE** · P2 · [Sustainability] Declutter challenge with goals
  - Why: sell/donate N items; ties Waste + Disposition
  - Status: SHIPPED (2026-08-26) — progress from unique disposition listings; `POST /disposition/challenge`; share card on disposition + waste summary; mobile Clear N + Share progress
  - Depends: WV05-SHARE-CARD, disposition
  - Files: `packages/shared/src/declutter.ts`, `apps/api/src/routes/disposition.ts`, `apps/api/src/routes/waste.ts`, `apps/mobile/app/(closet)/disposition.tsx`, `apps/mobile/src/lib/declutterChallenge.ts`
  - Acceptance: met — challenge progress N disposed; share card; vitest progress + API + mobile
  - Est: S

- [x] **GROW-FOUND-SHARE** · P2 · [Growth] Shareable found-money card (watermark)
  - Why: GTM success bar — unprompted forwards
  - Status: SHIPPED (2026-08-26) — vault Share builds redacted card (blur merchants + total + days-to-deadline + worn.app); Share.share + `found_money_share_card`; vault banner always visible on empty (no Connect-email full-screen)
  - Depends: ONB-60S-AHA
  - Files: `packages/shared/src/found-money.ts`, `apps/mobile/src/lib/foundMoney.ts`, `apps/mobile/app/(closet)/vault.tsx`
  - Acceptance: met — vitest found-money redact + mobile delight share + Gmail-optional empty copy; no raw merchants/card digits
  - Est: S

## Ingest trust (remaining)

- [x] **N47-MERCHANT-MUTE** · P2 · [Ingest] Per-merchant mute / pause
  - Why: stop food/OTP mail; reduces Gmail fear
  - Status: SHIPPED (2026-08-26) — PATCH `mutedMerchants` + worker skip + metrics Mute UI
  - Depends: N45-SYNC-FEED
  - Files: ingestion_sources meta, worker filter (`services/worker-ingest/src/mute.ts`), metrics mute
  - Acceptance: met — mute merchant → future docs skipped (UNMATCHED, no purchase); vitest filter
  - Est: S

- [x] **N48-MERGE-SPLIT** · P2 · [Ingest] Merge / split purchases
  - Why: fix double parses & multi-item orders
  - Status: SHIPPED (2026-08-26) — `POST /purchases/merge`, `POST /purchases/split`, `GET /purchases`; mobile metrics merge/split UI
  - Depends: N46-FIX-PARSE
  - Files: purchases API, mobile
  - Acceptance: met — merge two purchases; split items to new purchase; vitest integrity (totals = Σ lines, item ids preserved, source DUPLICATE)
  - Est: M

- [x] **N49-ACCT-HEALTH** · P1 · [Ingest] Connected accounts health (token/sync/errors)
  - Why: opened whenever magic fails
  - Status: SHIPPED (2026-08-26) — GET `/ingestion/sources` returns `error`/`hasToken`/`health`; metrics + connect-email + consent show lastSync/status/error + Reconnect CTA; worker persists AUTH_FAILED on token DLQ
  - Depends: N45-SYNC-FEED
  - Files: `packages/shared/src/account-health.ts`, ingestion routes, connect-email, metrics, consent
  - Acceptance: met — lastSyncAt, status, error, reconnect CTA; vitest status mapping (shared + mobile)
  - Est: S

## UX polish

- [x] **UX-HAPTICS** · P2 · [UX] Haptics on delight moments
  - Why: found money / wore-it / refund landed feel tangible
  - Status: SHIPPED (2026-08-26) — `delightHaptics` + `expo-haptics`; Reduce Motion gate; vault / wore-it / refund landed; `_layout` init
  - Depends: ONB-60S-AHA, N19, WV01-REFUND-LEDGER-UI
  - Files: `apps/mobile/src/lib/delightHaptics.ts`, vault / today / ReturnsPanel, `_layout`
  - Acceptance: met — three delight events; Reduce Motion off; vitest smoke
  - Est: S

- [x] **UX-MONEY-FMT** · P2 · [UX] Consistent ₹/grouping, dates, relative times; dark mode parity
  - Why: money-clear Closet language
  - Status: SHIPPED (2026-08-26) — `formatMinor` en-IN lakhs; `formatClosetDate` / `formatRelativeTime`; `closetDark` parity checklist; vault/accountant/waste
  - Depends: none
  - Files: `packages/shared/src/money.ts`, `apps/mobile/src/lib/format.ts`, `theme/tokens`
  - Acceptance: met — shared formatters on vault/accountant/waste; dark token checklist; vitest IN grouping
  - Est: S

- [x] **UX-PERF-LISTS** · P2 · [UX] Virtualize wardrobe/ledger lists; image cache
  - Why: low-end Android Closet must stay smooth
  - Status: SHIPPED (2026-08-26) — `ClosetVirtualList` FlatList windowing at >50; nested ScrollView bounded height; `CachedClosetImage` force-cache; wired wardrobe / vault credits+receipts / accountant ledger (no slice-20)
  - Depends: none
  - Files: `apps/mobile/src/lib/listVirtualization.ts`, `cachedImage.ts`, `ClosetVirtualList`, `CachedClosetImage`, wardrobe/vault/accountant
  - Acceptance: met — virt on >50; vitest threshold + cache source; perf checklist in listVirtualization.ts
  - Est: M

- [x] **ONB-EMPTY-DEMO** · P2 · [Onboarding] Personalized empty states + sample/demo mode
  - Why: blank vault kills first session if user hesitates
  - Status: SHIPPED (2026-08-26) — `emptyDemo` copy per surface; `EMPTY_DEMO_FLAG`; seed ₹500 sample clearly marked; Exit sample clears; vault/wardrobe empty CTAs
  - Depends: ONB-60S-AHA
  - Files: `apps/mobile/src/lib/emptyDemo.ts`, vault/wardrobe empty, closet store `clearDemoGiftCard`
  - Acceptance: met — demo seeds fake GC total clearly marked; exit clears; vitest: flag + progress helpers
  - Est: S

## Notifications lifecycle

- [x] **NOTIF-REENGAGE** · P2 · [Notifications] Found-money waiting + weekly digest (capped)
  - Why: D7 reopen without spam
  - Status: SHIPPED (2026-08-26) — `deliverFoundMoneyWaiting` / `deliverWeeklyDigest` via `runClosetPushDelivery`; frequency caps per category; quiet hours; worker-nudge + nudge-jobs
  - Depends: PUSH-LIVE-QUIET
  - Files: `packages/shared/src/reengage-nudge.ts`, `schemas/notifications.ts`, `apps/api/src/lib/nudge-jobs.ts`, `services/worker-nudge/*`
  - Acceptance: met — frequency caps; quiet hours; vitest: shared reengage + nudge-jobs + worker-nudge
  - Est: M

- [x] **NOTIF-RICH** · P2 · [Notifications] Rich pushes (image/amount) + Android channels
  - Why: item image on return deadline is the delight
  - Status: SHIPPED (2026-08-26) — Expo `channelId` + `richContent.image`; amount in data; Android channels per category on mobile
  - Depends: PUSH-LIVE-QUIET
  - Files: `packages/shared/src/push-delivery.ts`, `closet-push-flow.ts`, worker-returns imageUrl, `apps/mobile/src/lib/androidChannels.ts`
  - Acceptance: met — return push image URL; Android channel per category; vitest: payload shape
  - Est: M

## Monetization (start)

- [x] **MON-AFFILIATE-CLOSET** · P2 · [Monetization] Affiliate plumbing on Closet CTAs
  - Why: use-it-now + replace-twin revenue without paywall
  - Status: SHIPPED (2026-08-26) — Closet CTAs write `cashback_events` via `/cashback/click` (nullable listingId + source)
  - Depends: WV02-USE-NOW, N51
  - Files: `apps/api/src/lib/closet-affiliate.ts`, `apps/api/src/routes/cashback.ts`, vault Use it now, wardrobe missing-piece Shop
  - Acceptance: met — Closet affiliate clicks recorded; vitest event + helpers
  - Est: S

---

# Wave 3 — Social + occasions

## Social Closet

- [x] **N36-FAMILY-SHARE** · P3 · [Social] Family found-money share to WhatsApp
  - Why: household forwards = India K-factor
  - Status: SHIPPED (2026-08-26) — family share card + `worn.app/r/{code}`; `POST /referrals/attribute` + `GET /r/:code` log attribution; vault Share uses referral
  - Depends: GROW-FOUND-SHARE
  - Files: `packages/shared/src/family-share.ts`, referrals routes, vault.tsx
  - Acceptance: met — share includes referral code; attribution logged; vitest: link builder
  - Est: S

- [x] **N37-SWAP-CIRCLE** · P3 · [Social] Invite-only closet swap circle
  - Why: barter among friends ≠ public marketplace
  - Status: SHIPPED (2026-08-26) — `swap_circles`/`members`/`listings`; invite `worn.app/c/{code}`; list→private BARTER disposition; borrow/return; authz deny outsider
  - Depends: disposition modes
  - Files: packages/db schema+migration 0023, shared swap-circle authz, API `/swap-circles*`, mobile `(closet)/swap`
  - Acceptance: met — invite link; list item to circle; accept/borrow; vitest: membership authz
  - Est: L

- [x] **N38-ASK-FRIEND** · P3 · [Social] Ask-a-friend styling picks
  - Why: send outfit options; collect picks into wear plan
  - Status: SHIPPED (2026-08-26) — ephemeral outfit poll API; tally; `apply-winner` → week calendar; Today “Ask a friend”
  - Depends: WV04-SWIPE-ALT
  - Files: `packages/shared/src/ask-friend.ts`, `apps/api/src/routes/social-polls.ts`, today.tsx
  - Acceptance: met — share 2–3 outfits; votes tally; winner → calendar; vitest: vote tally
  - Est: M

- [x] **N35-RETURN-POLL** · P3 · [Anti-impulse] “Should I return?” friend poll
  - Why: WhatsApp vote drives return decisions
  - Status: SHIPPED (2026-08-26) — return poll create/vote + 48h expiry; ReturnsPanel share CTA
  - Depends: WV01-MOBILE-UNIFY
  - Files: `packages/shared/src/return-poll.ts`, social-polls routes, ReturnsPanel
  - Acceptance: met — share item + keep/return votes; vitest: poll expiry
  - Est: M

- [x] **N25-BORROW-LENT** · P3 · [Wardrobe] Borrowed / lent tracker
  - Why: friends/family borrow constantly
  - Status: SHIPPED (2026-08-26) — `lent_to`/`lent_due_on`; POST lend/return; GET `/wardrobe/lent?due=`; overdue BullMQ nudge; mobile Lend/Returned
  - Depends: wardrobe
  - Files: migration `0024_household_borrow_profiles.sql`, `borrow-lent.ts`, wardrobe routes, mobile wardrobe
  - Acceptance: met — lent-to + due date; overdue nudge; vitest due query
  - Est: S

- [x] **N26-HOUSEHOLD** · P3 · [Wardrobe] Household / shared closet
  - Why: couples & roommates share inventory + laundry
  - Status: SHIPPED (2026-08-26) — `households`/`members`; invite `worn.app/h/{code}`; shared wardrobe ACL + partner laundry PATCH; mobile household screen
  - Depends: N04-LAUNDRY-BASKET
  - Files: `household.ts`, `routes/households.ts`, migration `0024_*`, mobile household.tsx
  - Acceptance: met — invite partner; shared wardrobe ACL; vitest authz deny outsider
  - Est: L

- [x] **N27-KIDS-PROFILES** · P3 · [Wardrobe] Kids / multi-profile closets
  - Why: parents manage N wardrobes — high sessions
  - Status: SHIPPED (2026-08-26) — `closet_profiles` + `profile_id` on items; switcher; scoped wardrobe/outfits; mobile profile chips
  - Depends: N26-HOUSEHOLD (or lighter profiles)
  - Files: `closet-profile.ts`, `routes/closet-profiles.ts`, wardrobe `?profileId=`, mobile wardrobe
  - Acceptance: met — switch profile → scoped wardrobe/outfits; vitest scope
  - Est: M

## Occasions

- [x] **N39-WEDDING-FESTIVAL** · P3 · [Occasions] Wedding / festival wardrobe planner
  - Why: multi-day outfits + spend envelope (India peak)
  - Status: SHIPPED (2026-08-26) — event span → N day outfits + budget envelope; `multiDayOccasionSpan` in festivals; Today CTA
  - Depends: N01-WEEK-CAL, budgets
  - Files: `wedding-festival.ts`, festivals lib, outfits routes, mobile today
  - Acceptance: met — Event span → N outfits + budget envelope; vitest: day count
  - Est: L

- [x] **N40-INTERVIEW-KIT** · P3 · [Occasions] Interview / ceremony kit
  - Why: saved looks + night-before reminder
  - Status: SHIPPED (2026-08-26) — save kit; night-before (−1d) reminder + push queue; Today CTA
  - Depends: PUSH-LIVE-QUIET, N03-CAL-EVENT-OUTFIT
  - Files: `interview-kit.ts`, outfits routes, push, mobile today
  - Acceptance: met — Save kit; reminder −1d; vitest: schedule
  - Est: S

## WV-07 · Gifts (depth start)

- [x] **WV07-RANK-BUDGET** · P3 · [WV-07] Idea ranking “3 gifts in budget”
  - Why: north-star delight for Diwali/Rakhi
  - Status: SHIPPED (2026-08-26) — `rankGiftIdeas` taste+wishlist score, optional `budgetCap`, top 3; `GET /recipients/:id/ideas?budgetCap=`
  - Depends: recipients graph
  - Files: `packages/shared/src/gift-rank.ts`, `apps/api/src/routes/gifts.ts`, recipients ideas UI
  - Acceptance: met — ranked by taste (+wishlist) within budget; 3 returned; vitest: gift-rank fixture + gifts route budgetCap
  - Est: M

- [x] **WV07-OCCASION-PUSH** · P3 · [WV-07] Occasion pushes delivered (not QUEUED-only)
  - Why: “12 days to Diwali” only works if SENT
  - Status: SHIPPED (2026-08-26) — `deliverGiftOccasionPush` via closet-push-flow; festival lead 12d / birthday 3d; quiet hours delay; Expo SENT + deep link
  - Depends: PUSH-LIVE-QUIET, WV07-RANK-BUDGET
  - Files: `packages/shared/src/gift-occasion-push.ts`, `closet-push-flow.ts`, `gift-jobs.ts`, worker-gifts
  - Acceptance: met — festival/birthday lead schedule; SENT with `worn://recipients?focus=`; vitest: lead + quiet hours + Diwali copy
  - Est: S

## WV-01 · Returns depth

- [x] **WV01-PICKUP-BOOK** · P3 · [WV-01] Draft return + pickup booking
  - Why: concierge promise beyond countdown
  - Status: DONE
  - Depends: WV01-MOBILE-UNIFY
  - Files: returns state machine, merchant deep links / logistics stub
  - Acceptance:
    - Initiate pre-fills merchant return URL; pickup slot stored; vitest: state INITIATED→PICKUP_SCHEDULED
  - Est: L

- [x] **WV01-DEADLINE-IMAGE-PUSH** · P3 · [WV-01] Proactive “3 days left” push with item image
  - Why: delight moment for returns
  - Status: DONE
  - Depends: NOTIF-RICH
  - Files: return-jobs, push payload
  - Acceptance:
    - Push includes image when purchase item has imageKey; vitest: payload
  - Est: S

## WV-08 · Digest

- [x] **WV08-MONTHLY-DIGEST** · P3 · [WV-08] Monthly closet P&L digest push
  - Why: settlement-layer habit
  - Status: SHIPPED (2026-08-26) — `MONTHLY_DIGEST` via `deliverMonthlyDigest` / `scheduleAccountantMonthlyDigest`; enqueued from `/accountant/summary`; worker-nudge job
  - Depends: PUSH-LIVE-QUIET, accountant summary
  - Files: `accountant-jobs.ts`, `nudge-jobs.ts`, `reengage-nudge.ts`, `worker-nudge`
  - Acceptance: met — monthly push with spend + CPW; vitest: schedule monthly (`accountant-jobs.test.ts`)
  - Est: S

## Disposition polish

- [x] **DISP-MARKET-RAILS** · P3 · [Disposition] SELL/DONATE/BARTER on real sellers/listings rails
  - Why: waste dispose must not be nominal
  - Status: SHIPPED (2026-08-26) — SELL/BARTER create INDIVIDUAL seller + marketplace listing/variant; DONATE disposition-only; `disposition_listings.seller_id` → `sellers.id` FK (migration 0024)
  - Depends: none
  - Files: `disposition-marketplace.ts`, schema wardrobe, `0024_disposition_seller_fk.sql`
  - Acceptance: met — dispose creates seller listing row with FK; modes work; vitest: marketplace + unit tests
  - Est: M

---

# Wave 4 — Marketplace / concierge / monetize

## WV-06 · Fit

- [x] **WV06-OPTIONS-UI** · P4 · [WV-06] Richer optionsSchema UI (neckline/sleeve/pattern previews)
  - Why: BlouseBank delight — reorder needs visual pickers
  - Status: SHIPPED (2026-08-26) — `parseOptionsSchema`/`buildRichOptions`; templates return preview assets; Fit screen option pickers; vitest schema parse
  - Depends: none
  - Files: `apps/mobile/app/(closet)/fit.tsx`, `packages/shared/src/fit-options.ts`, `apps/api/src/routes/fit.ts`
  - Acceptance:
    - met — Template options render pickers with preview assets; vitest: schema parse
  - Est: M

- [x] **WV06-TAILOR-MKT** · P4 · [WV-06] Tailor marketplace (sellers FK, fabric photos, reviews, state machine)
  - Why: real GMV for Fit vault
  - Status: SHIPPED (2026-08-26) — assign TAILOR seller; fabric R2 upload + keys on order; reviews; tailor state machine; migration 0024
  - Depends: WV06-OPTIONS-UI
  - Files: fit routes, sellers, tailoring-jobs, mobile
  - Acceptance:
    - met — Order assigns tailor seller; fabric photos on R2; reviews; vitest: state transitions
  - Est: L

- [x] **WV06-REORDER-AVATAR** · P4 · [WV-06] Reorder one-tap + avatar customization preview
  - Why: north-star Fit aha
  - Status: SHIPPED (2026-08-26) — `POST /fit/preview` avatar try-on; one-tap reorder clones selections/fabric/tailor; Fit UI preview + reorder
  - Depends: WV06-TAILOR-MKT, render pipeline
  - Files: fit + wardrobe tryon
  - Acceptance:
    - met — Preview customization on avatar before order; one-tap reorder clones prior selections
    - vitest: clone order
  - Est: L

- [x] **WV06-REGION-PACKS** · P4 · [WV-06] Region packs beyond IN seed
  - Why: architecture Decision #3 — IN is launch pack not ceiling
  - Status: DONE
  - Depends: WV06-OPTIONS-UI
  - Files: customization_templates seed, fit API
  - Acceptance:
    - met — US/UK/GLOBAL packs queryable by region; vitest region-packs + fit templates filter
  - Est: M

## WV-07 · Gifts (full)

- [x] **WV07-WISHLIST-GROUP** · P4 · [WV-07] Wishlist + group gifting + wrap/message
  - Why: network GMV engine
  - Status: DONE
  - Depends: WV07-RANK-BUDGET
  - Files: gifts schema, mobile recipients
  - Acceptance:
    - met — wishlist refs; group contribute stub; wrap message on gift_orders; vitest create+contribute
  - Est: L

## Recover money (long-tail)

- [x] **N12-PRICE-DROP** · P4 · [Recover] Price-drop on owned brands
  - Why: replacement buys
  - Status: SHIPPED (2026-08-26) — `POST/GET /price-watches` + `POST /price-watches/scan`; threshold vs affiliate `realPrice`; push job `PRICE_DROP`; vitest threshold + scan
  - Depends: affiliate catalog
  - Files: `packages/shared/src/price-drop.ts`, `apps/api/src/lib/price-drop.ts`, `apps/api/src/routes/price-watches.ts`, migration `0027_recover_price_emi_cashback`
  - Acceptance: met — watchlist brand drop notify; vitest: threshold
  - Est: L

- [x] **N13-BNPL-EMI** · P4 · [Recover] BNPL / EMI fashion tracker
  - Why: India haul financing anxiety
  - Status: SHIPPED (2026-08-26) — `POST/GET /emi`, schedule + pay; BullMQ due nudge; vitest schedule jobId
  - Depends: money accounts or new EMI table
  - Files: `packages/shared/src/emi.ts`, `apps/api/src/lib/emi-jobs.ts`, `apps/api/src/routes/emi.ts`, `emi_plans` table
  - Acceptance: met — due dates + remaining; nudge; vitest: schedule
  - Est: M

- [x] **N14-CASHBACK-QUEUE** · P4 · [Recover] Cashback / reward claim queue
  - Why: unclaimed card cashback on fashion
  - Status: SHIPPED (2026-08-26) — `POST/GET /cashback-claims` + claim; Vault Claims tab; vitest CRUD
  - Depends: none
  - Files: `apps/api/src/routes/cashback-claims.ts`, `CashbackClaimsPanel`, `cashback_claims` table
  - Acceptance: met — list unclaimed + mark claimed; vitest: CRUD
  - Est: S

- [x] **N15-RTO-RECOVERY** · P4 · [Recover] RTO / failed-delivery recovery
  - Why: money stuck in undelivered orders
  - Status: SHIPPED (2026-08-26) — `GET /packages/rto-recovery` checklist + refund track; `POST /packages/:id/rto/start-refund`; vitest state + board
  - Depends: N09-PACKAGE-TRACK
  - Files: `packages/shared/src/rto-recovery.ts`, packages routes, `rto-size-repair.test.ts`
  - Acceptance: met — FAILED → checklist + refund track; vitest shared 5 + API board/start-refund
  - Est: M

- [x] **N17-SIZE-MAP** · P4 · [Recover] Size inconsistency map per brand
  - Why: returns → reorder confidence
  - Status: SHIPPED (2026-08-26) — return reason/orderedSize/preferredSize; `GET /returns/size-map` aggregate; vitest aggregate + route
  - Depends: returns + wardrobe
  - Files: `packages/shared/src/size-map.ts`, returns schema/routes, migration `0025_rto_size_repair.sql`
  - Acceptance: met — per-brand size history from returns; vitest aggregate + route
  - Est: M

## Wardrobe / sustainability depth

- [x] **N21-REPAIR-LOG** · P4 · [Wardrobe] Repair & alteration log
  - Why: feeds Fit vault + cost
  - Status: SHIPPED (2026-08-26) — `POST/GET /wardrobe/:id/repairs`, `GET /wardrobe/repairs`; accountant summary + ledger `REPAIR`; vitest create + roll-in
  - Depends: WV06 / wardrobe
  - Files: `packages/shared/src/repair-log.ts`, wardrobe routes, accountant, `repair_logs` table
  - Acceptance: met — log repair cost/date; accountant repairSpend; vitest create + ledger
  - Est: S

- [x] **WV05-CO2** · P4 · [WV-05] CO₂/water saved by re-wearing
  - Why: sustainability angle (explicitly deferred low-use — keep thin)
  - Status: SHIPPED (2026-08-26) — heuristic `computeCo2WaterSavings` from rewear counts (+ thin streak bonus); on `GET /waste/summary` as `co2WaterSavings`; wardrobe banner shows label
  - Depends: N53-REWEAR-STREAK
  - Files: `packages/shared/src/co2-savings.ts`, `apps/api/src/routes/waste.ts`, mobile wardrobe
  - Acceptance: met — heuristic CO₂/water from rewear count; waste summary; vitest formula + route
  - Est: S

- [x] **WV04-AUTOTAG** · P4 · [WV-04] Vision auto-tag + duplicate detection
  - Why: bulk import quality
  - Status: SHIPPED (2026-08-26) — `POST /wardrobe/autotag` + bulk `autoTag`; mock/hosted vision tagger; near-dup via `findDuplicateWarnings`
  - Depends: WV04-BULK-IMPORT
  - Files: `packages/shared/src/wardrobe-autotag.ts`, `apps/api/src/lib/wardrobe-vision.ts`, `routes/wardrobe.ts`
  - Acceptance: met — auto category/color/brand; near-dup warn; vitest fixtures
  - Est: L

## Concierge lite → human

- [x] **N55-PHOTO-DUMP** · P3 · [Concierge] Photo dump → sorted closet (pre-human)
  - Why: white-glove without ops headcount
  - Status: SHIPPED (2026-08-26) — `POST /wardrobe/photo-dump` + `runPhotoDump` (vision auto-tag → wardrobe); shared helpers; vitest 20+ batch
  - Depends: WV04-BULK-IMPORT, WV04-AUTOTAG (or light tags)
  - Files: `packages/shared/src/photo-dump.ts`, `apps/api/src/lib/photo-dump.ts`, `routes/wardrobe.ts`
  - Acceptance: met — upload 20+ photos → tagged wardrobe items; vitest batch route + lib
  - Est: L

- [x] **CONCIERGE-OPS** · P4 · [Concierge] Operator console ingest/sort/list (consented)
  - Why: human layer architecture §2.1/§2.4
  - Status: SHIPPED (2026-08-26) — `/admin/concierge/:userId/{wardrobe,photo-dump,items,list}` behind JWT+admin secret+CONCIERGE consent; audit events; vitest authz
  - Depends: N55-PHOTO-DUMP, TRUST audit
  - Files: `apps/api/src/lib/concierge-ops.ts`, `routes/admin.ts`, `packages/shared/src/schemas/concierge.ts`, consent CONCIERGE
  - Acceptance: met — operator acts on behalf of user with audit; vitest authz + ingest/sort/list
  - Est: L

## Monetization / marketplace

- [x] **MON-REVENUECAT** · P2 · [Monetization] RevenueCat subscription (Accountant + Outfits)
  - Why: settlement + retention monetization
  - Status: SHIPPED (2026-08-26) — env-gated entitlements + webhook scaffold; paywall trial; gates accountant/outfits when FEATURE_PREMIUM_GATES=1; no store secrets
  - Depends: Wave 2 habit proof preferred
  - Files: `packages/shared/src/entitlements.ts`, `apps/api/src/lib/entitlements.ts`, `/webhooks/revenuecat`, `/entitlements*`, mobile `revenueCat.ts` + `PremiumGate`
  - Acceptance: met — Paywall + trial; entitlement gates premium surfaces; vitest: gate
  - Est: M

- [x] **MON-TAKE-RATE** · P4 · [Monetization] Marketplace take-rate (tailoring/resale) + payout/tax
  - Why: Fit + Disposition economics
  - Status: SHIPPED (2026-08-26) — fee math + GST; settle on completed order; CSV export; FEATURE_TAKE_RATE
  - Depends: WV06-TAILOR-MKT, DISP-MARKET-RAILS
  - Files: `packages/shared/src/take-rate.ts`, `apps/api/src/lib/take-rate.ts`, `/marketplace/settlements*`, tailoring DELIVERED settle
  - Acceptance: met — Take-rate on completed order; report export; vitest: fee math
  - Est: L

- [x] **MON-UPI-REGIONAL** · P4 · [Monetization] India price points + UPI/Razorpay experiments
  - Why: regional payments for Closet premium
  - Status: SHIPPED (2026-08-26) — IN price table; UPI path when EXPERIMENT_UPI_CHECKOUT; stub deep-link + staging smoke; no live Razorpay keys
  - Depends: MON-REVENUECAT
  - Files: `packages/shared/src/regional-pricing.ts`, `packages/shared/src/payments.ts`, `apps/api/src/lib/payments/adapter.ts`, `/payments/*`
  - Acceptance: met — UPI path in IN builds; experiment flag; staging smoke
  - Est: L

- [x] **WV02-BALANCE-CHECK** · P2 · [WV-02] Merchant balance-check integrations / manual re-check reminder
  - Why: ledger as mirror needs refresh
  - Status: SHIPPED (2026-08-26) — Amazon/Flipkart API-capable refresh (hosted `MERCHANT_BALANCE_API_URL` or stub); else manual re-check nudge + Vault Re-check UI; BullMQ `credit-balance-recheck` drained by worker-expiry
  - Depends: money truth decision (documented in money-reconcile.ts)
  - Files: `packages/shared/src/merchantBalanceCheck.ts`, `apps/api/src/lib/balance-check.ts`, `balance-check-jobs.ts`, `routes/credits.ts`, vault.tsx, `services/worker-expiry`
  - Acceptance: met — API refresh where capable; else nudge re-check; vitest reminder + credits routes + worker
  - Est: L

## Trust / legal / ops (scale)

- [ ] **TRUST-PENTEST** · P2 · [Trust] Third-party security review before real-money GA
  - Why: financial + inbox scope
  - Status: PARTIAL (2026-08-26) — readiness packet in `docs/PENTEST_READINESS.md` + CI `check-pentest-readiness`; **no third-party report yet** (do not fake)
  - Depends: TRUST-EXPORT-UI, TRUST-RETENTION
  - Files: `docs/PENTEST_READINESS.md`, `scripts/check-pentest-readiness.mjs`, CI
  - Acceptance: third-party report received + P0 findings fixed before real-money GA (readiness docs alone ≠ done)
  - Est: L

- [ ] **TRUST-DPDP-GDPR** · P1 · [Trust] DPDP + GDPR compliance pass + privacy policy + DPAs
  - Why: EU soft launch + India legal
  - Status: PARTIAL (2026-08-26) — privacy draft + checklist + in-app links + CI `check-dpdp-gdpr`; counsel wet-ink + published policy URL still open
  - Depends: TRUST-EXPORT-UI
  - Files: `docs/TRUST_DPDP_GDPR.md`, `docs/legal/PRIVACY_POLICY_DRAFT.md`, `VaultPrivacyActions`, `privacyLinks.ts`, CI
  - Acceptance: counsel-approved privacy policy published + DPA inventory signed (draft/checklist alone ≠ done)
  - Est: L

- [x] **REL-STORE-LISTINGS** · P2 · [Release] App Store + Play listings, Data Safety, screenshots
  - Why: GTM ASO — screenshot #1 = found-money
  - Status: SHIPPED (2026-08-26) — paste-ready EN/IN listing copy, Play Data Safety + App Privacy checklists, screenshot storyboard (#1 found-money), Play closed-testing ≥12 checklist; CI `check-store-listings` (no store submit)
  - Depends: REL-EAS-GATES, ONB-60S-AHA
  - Files: `docs/STORE_LISTINGS.md`, `scripts/check-store-listings.mjs`, CI
  - Acceptance: met — listings drafted to match privacy/Data Safety; ≥12 closed-tester gate documented; no ASC/Play submit from CI
  - Est: M

- [x] **OPS-PLAYBOOKS** · P4 · [Ops] Parser breakage / refund disputes / deletion SLAs
  - Why: support when money is wrong
  - Status: SHIPPED (2026-08-26) — three playbooks under `docs/playbooks/`; `GET /admin/ops/playbooks`; CI `check-ops-playbooks`
  - Depends: CONCIERGE-OPS optional
  - Files: `docs/playbooks/*`, `apps/api/src/lib/ops-playbooks.ts`, `apps/api/src/routes/admin.ts`, `scripts/check-ops-playbooks.mjs`
  - Acceptance: met — parser-breakage, refund-disputes, data-deletion linked from admin
  - Est: M

- [x] **N44-TAX-PACK** · P4 · [Accountant] Workwear tax pack export
  - Why: yearly professional claims
  - Status: SHIPPED (2026-08-26) — `GET /accountant/tax-pack?year|from&to&format=json|csv|zip`; workwear-filtered spend+invoices CSVs; store-method ZIP
  - Depends: WV08-CSV-UI, N18-GST-INVOICE
  - Files: `tax-pack.ts`, accountant route, shared `TaxPackResponseSchema`
  - Acceptance: met — yearly ZIP/CSV of invoices+spend; vitest: date range (`tax-pack.test.ts`, accountant route)
  - Est: M

- [x] **DISP-LOGISTICS** · P4 · [Disposition] Pricing suggestions + pickup/logistics partner
  - Why: complete sell/donate loop
  - Status: SHIPPED (2026-08-26) — `suggestDispositionPrice` heuristic; partners stub; `POST /disposition/:id/pickup` book stub
  - Depends: DISP-MARKET-RAILS
  - Files: `disposition-logistics.ts`, disposition routes, shared schemas
  - Acceptance: met — suggest price; book pickup stub; vitest: suggest heuristic (`disposition-logistics.test.ts`, disposition route)
  - Est: L

---

## Item count summary

| Bucket | Count |
|--------|------:|
| Wave 0 (IN FLIGHT) | **11** |
| Wave 1 | **25** |
| Wave 2 | **40** |
| Wave 3 | **15** |
| Wave 4 | **25** |
| **Total executable** | **116** |

| Of which | Count |
|----------|------:|
| Net-new N01–N55 (each present once) | **55** |
| Doc High/Med incomplete + platform (non-N) | **61** |

N01–N55 ID index: `N01`…`N06` Wave2 Today · `N07`–`N08` Wave0 · `N09`–`N11`,`N16`,`N18` Wave2 · `N12`–`N15`,`N17` Wave4 · `N19` Wave0 · `N20`–`N24`,`N28`–`N32` Wave2 · `N25`–`N27` Wave3 · `N33`–`N34`,`N50`–`N54` Wave2 · `N35`–`N40` Wave3 · `N41`–`N43` Wave2 · `N44` Wave4 · `N45`–`N46` Wave0 · `N47`–`N49` Wave2 · `N55` Wave4.

---

## Explicitly deferred (do not pad backlog)

- Pen-test theater before Wave 1 mock beta
- Group gifting complexity before WV07-RANK-BUDGET
- Full CO₂ ledgers beyond heuristic `WV05-CO2`
- Outlook connector (after Gmail E2E)
- Public disposition marketplace SEO (keep invite circles first)
