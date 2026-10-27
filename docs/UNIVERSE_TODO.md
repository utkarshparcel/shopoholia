# WORN Universe — Master TODO (to a complete, lovable app)

> Executable engineer backlog (waves, acceptance, N01–N55): [`UNIVERSE_DETAILED_TODO.md`](./UNIVERSE_DETAILED_TODO.md).
> Usable + wow next-100 (Closet polish): [`UNIVERSE_WOW100.md`](./UNIVERSE_WOW100.md).
> Job-completing next-50 (utility chores): [`UNIVERSE_USEFUL50.md`](./UNIVERSE_USEFUL50.md).
>
> Synced 2026-08-26 reconcile vs DETAILED/WOW100 — `[x]` only where code+docs clearly meet the master bar; partials keep `[ ]` + italic remainder; counsel wet-ink / live Gmail E2E / real pentest stay open.
>
> The single backlog that ties together `UNIVERSE_ARCHITECTURE.md` (what), `UNIVERSE_DEV_PLAN.md` (how/when), and `UNIVERSE_QA_REPORT.md` (what's broken today). Goal: not "feature-complete" but **an app people actually love** — every module has a delight moment, every flow is complete, and the trust bar is met.
>
> **Legend** — priority `P0`=now/blocking · `P1`=first beta · `P2`=retention · `P3`=depth · `P4`=scale. `[ ]` todo · `[x]` done this QA pass. Cross-refs: `QA:B1` = blocker 1 in the QA report.

## North star — the "aha" per module (the bar every task serves)
- **Gift-Card Vault** → *"You have ₹2,400 in forgotten credit."* (found money, day one)
- **Warranty/Receipt** → *snap → auto-filed → "we'll remind you before it lapses."*
- **Return Concierge** → *"3 days left to return that jacket — tap to start."*
- **Wardrobe + Outfits** → *"Here's your outfit for today,"* on your own avatar, every morning.
- **Waste Tracker** → *"₹40k of clothes you've never worn"* → one tap to sell/donate.
- **Fit Vault** → *"Reorder your blouse in one tap"* — measurements never lost.
- **Gift Engine** → *"Diwali in 12 days — here's the perfect gift for Mom."*
- **Accountant** → *"Your closet cost ₹X this month · cost-per-wear ₹Y."*

---

## Track 0 — Stabilize now (make the current build trustworthy)
- [x] **P0** QA:B2 — `requireConsent("FINANCIAL")` + `audit("money.read")` on all Accountant routes.
- [x] **P0** Mobile crash — guard `crypto.randomUUID()` in gift-card spend.
- [x] **P0** QA:B1 — fix hard-delete: delete full user-owned graph (orders, coin_ledger, iap_receipts, sellers, carts, avatars, renders, tryon_previews, cashback, push_events, all universe tables) in FK-safe order, one transaction; mirror in `memory.ts`.
- [x] **P0** QA:B3+M1+M2 — money-schema migration: add `money_ledger.account_id` FK, `merchant_purchases.userId` FK, unique index for credit idempotency; update `postLedgerEntry`, `listMoneyLedger`, `credits.ts`, both repos.
- [x] **P0** QA:M3 — complete `GET /vault/export` across all ~12 missing user tables.
- [x] **P0** QA — remove `// @ts-nocheck` from `accountant.ts`; fix the type errors it hides.
- [x] **P0** Gate — `eslint --fix` the `@worn/api` lint failures (no-explicit-any, consistent-type-imports, unused vars); get CI green.
- [x] **P0** Add regression tests: un-consented financial read → 403; credit double-spend race; hard-delete leaves zero user rows; export round-trips.
- [x] **P1** QA:minor — rename `SMMS`→`SMS` consent scope (enum + rename migration + shared + route); dedupe `analytics.ts` (shared vs api copies).

## Track 1 — Platform spine (finish the foundation)
- [x] **P0** Ingestion (QA:B4) — real Gmail `history.list`/`messages.list` sync, `startHistoryId` bootstrap, **refresh-token exchange**, move OAuth callback off `requireAuth` (signed `state`).
- [x] **P1** Parser accuracy (QA:M4) — grand-total (word-boundary, not "Subtotal"), Indian lakh grouping, real currency detection, **populate `merchant_purchase_items`** for all 5 merchants + generic; wire the parser-accuracy spike into CI with a coverage threshold.
- [x] **P1** SMS ingest — Android SMS retriever → `POST /ingestion/sms`; iOS forwarding-address path + copy.
- [x] **P1** Trust/Vault — consent center is the source of truth; encryption-at-rest verified for tokens + documents; retention policy (delete raw docs after parse); audit log queryable.
- [x] **P1** Money Ledger v2 — reconciliation job (cache vs ledger sum), multi-currency display, "source of truth vs merchant mirror" decision documented.
- [x] **P2** Disposition marketplace — actually create `sellers`/`listings` rows (QA:minor), sell/donate/**barter** flows on real rails. *(SELL/BARTER → INDIVIDUAL seller + listing; DONATE disposition-only; seller_id FK 2026-08-26)*

- [x] **P2** Ingestion resilience — dead-letter queue, per-source backoff, coverage/miss dashboard, idempotent jobs (stable `jobId`, QA:minor).

## Track 2 — The 8 modules → lovable & complete
> Each: finish stubs, wire the full mobile flow, add the delight, harden. Backend scaffolding largely exists (see QA).

### WV-01 Return Concierge  ·  Recover · Global
- [x] **P1** QA:M5 — fix merchant-key casing so real windows apply (Amazon 30 / Flipkart 7, not default 14).
- [x] **P3** Draft + one-tap initiate return (pre-filled), pickup booking, refund tracked to `money_ledger`.
- [x] **P3** Mobile: unify the orphaned `returns.tsx` with the Vault ReturnsTab; live countdown + status timeline.
- [x] **P3** Delight: proactive "3 days left" push with the item image; "refund landed 🎉".

### WV-02 Gift-Card & Store-Credit Vault  ·  Recover · Global
- [x] **P1** Idempotent add (QA:M2 done — orphan shells cleaned); auto-fill balances from ingestion; barcode/photo capture of physical cards.
- [x] **P1** Delight: "found money" running total on the Vault home; expiry badges; "use it now" → merchant deep-link/affiliate. *(total + badges done; affiliate deep-link still open)*
- [x] **P2** Balance-check integrations for top merchants (where APIs exist); manual re-check reminder otherwise.

### WV-03 Warranty & Receipt Vault  ·  Recover · Global
- [x] **P1** Real OCR provider decision + wire (currently mock); confidence + manual-correct UI. *(hosted when OCR_PROVIDER_URL set; confidence always; PATCH + confirm body corrections; mobile badge + threshold override)*
- [x] **P1** Warranty auto-detect from receipt/merchant; one-tap claim (prefilled email/deep-link).
- [x] **P2** Expiry lead-time (QA:M6) so reminders fire *before* lapse; snooze; category coverage (electronics, appliances, apparel).

### WV-04 Digital Wardrobe + Morning Outfits  ·  Closet · Global (retention engine)
- [x] **P2** Replace the outfit **stub** (QA:minor): real weather + calendar + clean/laundry state + taste ranking; "why this" explainability. *(weather/laundry/taste/whyThis + N03 calendar→occasion done)*
- [x] **P2** Wardrobe try-on: re-enable `tryon_previews` cache (QA:minor — stop re-paying renders); bulk closet import (photos, ingested purchases auto-add). *(cache done 2026-08-26; bulk import shipped 2026-08-26)*
- [x] **P2** Delight: daily 7am "your outfit today" on your avatar; swipe alternatives; "wore it" one-tap (feeds wear-log). *(7am TZ push + swipe alts + wear-log done 2026-08-26; packing/travel still open)*
- [x] **P3** Auto-tagging (category/color/brand) via vision model; duplicate detection.

### WV-05 Style Waste Tracker  ·  Closet · Global (shareable)
- [x] **P2** Cost-per-wear surfaced per item + "dead since" ; wardrobe ROI summary; shareable card ("₹X never worn").
- [x] **P2** One-tap dispose → sell/donate/barter (Disposition); "wear it 3× challenge" nudge.
- [x] **P3** Sustainability angle: CO₂/water saved by re-wearing; declutter streaks.

### WV-06 Fit & Customization Vault (BlouseBank)  ·  Closet · India-first, global-ready
- [x] **P4** Region packs beyond IN seed (suits/hemming/alterations); richer `optionsSchema` UI (neckline/sleeve/pattern pickers with previews).
- [x] **P4** Tailor marketplace: real `sellers` rows + FK (QA:minor), measurements snapshot → tailor, order state machine, fabric photos, reviews.
- [x] **P4** Delight: "reorder your blouse" one-tap; try customization on your avatar before ordering.

### WV-07 Gift Intelligence Engine  ·  Outward · Global (+IN festivals)
- [x] **P4** Recipient profiles (sizes/taste/wishlist), occasion calendar (birthdays + Diwali/Rakhi/weddings) with reminders.
- [x] **P4** Idea ranking from taste graph; affiliate/commission checkout; gift wrap/message; group gifting.
- [x] **P4** Delight: "12 days to Diwali — 3 perfect gifts for Mom, all in budget."

### WV-08 Wardrobe Accountant  ·  Settlement · Global
- [x] **P1** QA:M7 — fix budget-vs-actual math (per-item allocation, real category mapping); stop false `budget_exceeded`.
- [x] **P1** QA:M8 — kill the N+1 (batch item fetch / join); reconcile category taxonomy to budget enum.
- [x] **P3** Monthly "closet P&L" digest; budget nudge at Play checkout (spend-awareness bridge); export CSV.

### Disposition & Concierge (the human layer)
- [x] **P4** Sell/donate/**barter** end-to-end; pricing suggestions; pickup/logistics partner.
- [x] **P4** Concierge: operator console to ingest + sort a user's wardrobe; white-glove onboarding; unit-economics tracking. *(N55 photo-dump + CONCIERGE-OPS)*

## Track 3 — Onboarding & the first-run "aha"
- [x] **P1** <60s to first delight: connect email (or add one card) → **surface found money immediately**.
- [x] **P1** Wire the real consent/connect flow (QA:M9) — consent screen writes grants, connect-email does OAuth, both reachable; transparency copy ("why we ask, what we never do").
- [x] **P1** Progressive permissions (ask for email/notifications *in context*, not upfront); skip-friendly.
- [x] **P2** Personalized empty states ("add your first receipt", "snap a gift card") with sample/demo mode.
- [x] **P2** Feature-flag every Closet screen (QA:minor — vault/accountant/consent currently deep-linkable with flag off).

## Track 4 — Design system & UX polish (lovability)
- [x] **P1** Real design language for Closet (extend `theme/tokens`): calm, trustworthy, money-clear; distinct from Play's dopamine tone but coherent.
- [ ] **P1** Every screen: loading skeletons, empty, error, offline states; optimistic UI on writes; pull-to-refresh. *(ClosetScreen kit on today/wardrobe/vault/accountant; optimistic writes + PTR/offline parity on remaining Closet tabs still open — W096/W097)*
- [x] **P2** Micro-interactions & haptics on the delight moments (found money, wore-it, refund landed).
- [x] **P2** Consistent money formatting (₹ Indian grouping), dates, relative times; dark mode parity.
- [x] **P2** Surface toggle persistence (QA:minor — restore never fires; add persisted store) + last-surface memory.

## Track 5 — Notifications & lifecycle
- [x] **P1** Deadline engine: return windows, warranty + gift-card expiry, morning outfit, gift occasions — all with correct **lead time** (QA:M6) and stable dedupe.
- [x] **P1** Notification preferences center; quiet hours; per-category opt-in; deep-links to the exact screen.
- [x] **P2** Re-engagement: "found money waiting", weekly closet digest, streak reminders — frequency-capped.
- [ ] **P2** Rich pushes (item image, amount); Android channels; iOS provisional auth. *(rich image/amount + Android channels shipped — NOTIF-RICH; iOS provisional auth still open)*

## Track 6 — Trust, privacy, security & legal (the pivot — non-negotiable)
- [x] **P0** Working hard-delete + full export (Track 0); data retention schedule per data type.
- [x] **P1** Consent center: granular, revocable, audited; show exactly what's connected and what's read.
- [ ] **P1** DPDP (India) + GDPR compliance pass; privacy policy + in-app data dashboard; DPA with sub-processors (Gmail, OCR, storage). *(packet + draft + in-app reader shipped — counsel wet-ink + published URL remain founder gate; `docs/TRUST_DPDP_GDPR.md`)*
- [ ] **P1** Security: secrets management, encryption keys rotation, signed-URL-only media, rate-limit + abuse on all money/ingestion routes. *(rate-limit + signed R2 URLs + token AES-GCM shipped; encryption key rotation still open)*
- [ ] **P2** Third-party security review / pen test before real-money GA; threat model for financial + inbox scope. *(readiness + threat model shipped — real third-party report remains real-money GA gate; no fake report; `docs/PENTEST_READINESS.md`)*
- [ ] **P2** Google OAuth **restricted-scope verification** (Gmail read) — start early, it's slow. *(CASA packet + Limited Use + CI track shipped — live Google verification / submit still open; `docs/CASA.md`)*
- [x] **P0** Fix pre-existing env drift (`JWT_SECRET`/`PORT` vs `.env`), `launch.json` `design-system` path.

## Track 7 — Payments & monetization
- [x] **P2** Subscription (Accountant + Outfits) via RevenueCat; paywall + trial; entitlement gating.
- [x] **P2** Affiliate/commission plumbing reused from `cashback_events` for gift-card spend, "buy the real thing", gift checkout, replacements.
- [x] **P3** Marketplace take-rate (tailoring, resale); payout + tax handling; refunds.
- [x] **P3** Pricing experiments; India price points; regional payment methods (UPI/Razorpay).

## Track 8 — Growth, retention & delight
- [ ] **P2** Shareable moments: "found ₹X", "₹40k never worn", outfit cards — with tasteful watermark. *(found-money + never-worn share cards shipped; outfit share cards still open)*
- [ ] **P2** Referral reuse (existing `referralCode`); gift-driven virality (recipient onboards). *(referralCode + family found-money share shipped; gift-driven recipient onboard still open)*
- [ ] **P3** Habit loops: morning outfit, weekly digest, streaks; personalization from wear-log + taste. *(morning outfit + digest + rewear/declutter streaks shipped; deeper wear-log→taste personalization still open)*
- [ ] **P3** In-app feedback + 1-tap CSAT after each delight; NPS; feature request board.

## Track 9 — Data & ingestion quality (the make-or-break bet)
- [ ] **P1** Merchant coverage plan: top-N Indian + global merchants; per-merchant parser tests from real (anonymized) fixtures. *(top-5 IN merchants + fixture spike in CI; documented top-N global coverage plan still open)*
- [ ] **P1** Parser accuracy dashboard + target (e.g. ≥90% correct total/currency) as a launch gate. *(CI spike + Closet metrics coverage shipped; formal ≥90% product launch-gate dashboard still open)*
- [ ] **P2** Human-in-the-loop correction feeds back to parsers; unknown-merchant fallback quality. *(N46 purchase/credit correction shipped; parser-training feedback loop still open)*
- [ ] **P2** OCR accuracy benchmark; on-device vs hosted cost/quality decision. *(hosted-vs-on-device decision documented; continuous OCR accuracy benchmark still open)*

## Track 10 — Performance, accessibility, i18n, offline
- [ ] **P2** Perf budgets: list virtualization (wardrobe, ledger), image caching/resizing, render pre-warm; cold-start < 2s. *(list virt + CachedClosetImage shipped; cold-start &lt;2s + render pre-warm still open — W095/W098)*
- [ ] **P2** Accessibility: screen-reader labels, dynamic type, contrast (both themes), touch targets. *(partial labels on vault/stack; full dynamic-type/contrast/touch-target pass still open — W099)*
- [ ] **P2** i18n: English + Hindi (India-first) + framework for regional; ₹/date/number locales. *(₹/date/number locales shipped; Hindi/Hinglish copy packs still open — W091)*
- [ ] **P3** Offline-first reads (cached wardrobe/vault), queued writes, conflict handling. *(offline vault-add queue shipped; full wardrobe/vault cache + conflict handling still open)*

## Track 11 — Observability, analytics & experimentation
- [x] **P1** Analytics funnel wired end-to-end (install → connect → found-money → habit → paid); dedupe the analytics modules.
- [ ] **P1** Sentry (app + api + workers), structured logs, ingestion cost + coverage dashboards, alerting on money anomalies. *(Sentry Closet-wide + ingestion coverage/cost metrics shipped; money-anomaly alerting still open)*
- [ ] **P2** Experimentation harness (feature flags + A/B) for onboarding, nudge timing, pricing. *(feature flags + empty-copy AB shipped; full A/B harness for nudge timing/pricing still open)*
- [ ] **P2** KPI dashboard: D1/D7/D30, found-money/user, wear-log rate, cost-per-wear, conversion.

## Track 12 — Release engineering & app-store
- [x] **P1** CI: run all workers' tests (fix `--passWithNoTests` gaps), migration check, typecheck+lint+test green on every PR.
- [x] **P1** EAS build profiles (dev/preview/prod), OTA update strategy, staged rollout, crash-free-rate gate.
- [x] **P2** App Store + Play listings, screenshots, privacy nutrition labels / Data Safety, review-guideline compliance (esp. financial + Gmail scope).
- [ ] **P2** Env/secret management per stage; DB migration runbook; rollback plan.

## Track 13 — Concierge & human ops
- [x] **P4** Operator tooling (ingest/sort/list on behalf of user, fully consented + audited). *(CONCIERGE-OPS + N55)*
- [ ] **P4** Support inbox + macros; SLA; escalation for money/data issues.
- [x] **P4** Ops playbooks: merchant-parser breakage, refund disputes, data-deletion requests.

---

## Definition of "lovable & complete" (the quality bar / launch gate)
- [ ] Every user-facing screen has real content + loading/empty/error/offline states — **no stubs shipped as done**.
- [ ] Each module delivers its "aha" (North star) within the first session.
- [ ] Trust bar met: consent granular+revocable, export + hard-delete provably complete, money numbers correct & reconciled, security-reviewed.
- [ ] Ingestion hits the parser-accuracy target on real inboxes; wrong-number rate below gate.
- [ ] Green CI (typecheck+lint+test), crash-free ≥ 99.5%, cold-start < 2s, a11y pass.
- [ ] Analytics funnel + Sentry live; can answer "did the reveal/found-money land?" with data.
- [ ] Legal: DPDP + GDPR packet + privacy draft shipped (`TRUST-DPDP-GDPR`); counsel wet-ink + published URL + OAuth verification still open; store listings packet shipped (`REL-STORE-LISTINGS`).

## Suggested sequencing (maps to the dev plan)
1. **Now (P0):** Track 0 stabilize + Track 6 hard-delete/export + env fixes → the build is trustworthy.
2. **Beta-1 (P1):** Track 1 spine (real ingestion) + WV-02/03 + WV-08 fixes + onboarding "aha" + design/notifications/observability baseline.
3. **Beta-2 (P2):** WV-04/05 retention + monetization + growth + perf/a11y/i18n.
4. **GA (P3):** WV-01 + Accountant depth + experimentation + store launch.
5. **Scale (P4):** WV-06 Fit marketplace + WV-07 Gift Engine + Disposition + Concierge.
