# WORN — USEFUL-50 (job-completing backlog)

> Next **50** Closet-first tickets that deepen *utility* (finish a chore, save money, prevent loss) — complementary to wow/polish in [`UNIVERSE_WOW100.md`](./UNIVERSE_WOW100.md).
>
> Synced 2026-08-27 from ethos in `UNIVERSE_ARCHITECTURE.md`, `GTM_ZERO_SPEND.md`, `.cursor/skills/worn-gtm/SKILL.md`.
>
> **Companion:** Engineer SoT remains [`UNIVERSE_DETAILED_TODO.md`](./UNIVERSE_DETAILED_TODO.md). Master bar: [`UNIVERSE_TODO.md`](./UNIVERSE_TODO.md).
>
> **Legend** — priority `P0`–`P2` · Est `S` (&lt;2d) | `M` (2–5d) · IDs `U001`–`U050`.
> Mark `[x]` only after verifying shipped code in-session. Do **not** re-list shipped `N##` / `WV##` / `W###`.

---

## Ethos guardrails (same as WOW)

1. Play ≠ Closet screens; bridges only via explicit CTAs.
2. Found-money aha without public Gmail; trust framing always.
3. Ingestion is a platform — one purchase graph.
4. No PII in shares; consent/revoke/export sacred.
5. India + Global EN (₹/$); regional packs, not India-only.
6. **Useful gate:** each ticket must let a user *complete or unblock a real chore* — not just motion/copy polish.

**Anti-patterns:** blended surfaces, Gmail-required aha, coupon spam, bank/wallet positioning, wow-only confetti without a job.

---

## Waves

| Wave | IDs | Theme | Exit |
|------|-----|--------|------|
| **U1** | U001–U015 | Money truth + vault chores | Partial spend, merge, expiry action, reconcile |
| **U2** | U016–U030 | Returns / packages / claims | Portal fields, tracking, refund chase, RTO |
| **U3** | U031–U040 | Today + wardrobe ops | Laundry, wear log, fit, dispose |
| **U4** | U041–U050 | Ingest accuracy + trust ops | Parse fix loop, consent, household, regional |

---

# Cluster 1 · Money truth & vault chores (U001–U015) · P0/P1 · Wave U1

- [x] **U001-PARTIAL-SPEND-SPLIT** · P0 · [Vault] Split gift-card balance after partial merchant spend
  - Why: real cards are rarely spent to zero; vault must stay truthful
  - Depends: credits ledger
  - Files: credits routes, vault card detail
  - Acceptance: Enter spent amount → remaining balance + ledger SPEND; undo within 60s
  - Est: M

- [x] **U002-SAME-MERCHANT-MERGE** · P0 · [Vault] Merge duplicate gift cards / store credits for one merchant
  - Why: ingestion + manual adds create twins; users need one actionable total
  - Depends: purchase-merge patterns
  - Files: vault, credits merge API
  - Acceptance: Suggest merge when same merchant+currency; confirm → single account; audit row
  - Est: M

- [x] **U003-EXPIRY-ACTION-CHECKLIST** · P0 · [Vault] Expiry ≤7d → actionable checklist (use / transfer / sell reminder)
  - Why: countdown alone isn’t a chore complete
  - Depends: W016 expiry hero (polish exists)
  - Files: vault expiry board
  - Acceptance: 3 actions with deep links; mark “handled” snoozes push 7d
  - Est: S

- [x] **U004-BALANCE-STALE-FORCE** · P0 · [Vault] Stale balance (>30d or merchant rule) blocks “use now” until recheck or confirm
  - Why: wrong balances destroy trust
  - Depends: WV02 balance-check
  - Files: vault card CTA
  - Acceptance: Soft-block with Recheck / I confirm; analytics `stale_balance_override`
  - Est: S

- [x] **U005-MULTI-CURRENCY-LEDGER-VIEW** · P1 · [Vault] Per-currency subtotals + prefer preferred currency for hero
  - Why: Global EN users hold $ and £ cards
  - Depends: W003 currency prefs
  - Files: vault home, formatMinor
  - Acceptance: Subtotals by currency; hero uses preferred; no silent FX
  - Est: S

- [x] **U006-CASHBACK-CLAIM-DEADLINE** · P0 · [Cashback] Claim-before date surfaced + one-tap claim start
  - Why: cashback expires like gift cards
  - Depends: cashback claims routes
  - Files: vault / cashback panel
  - Acceptance: Sorted by claim deadline; CTA opens claim flow; push at T-3d
  - Est: M

- [x] **U007-EMI-SCHEDULE-FROM-SMS** · P1 · [EMI] Parse EMI due SMS → schedule rows + mark paid
  - Why: India EMI miss = fees; useful chase
  - Depends: SMS ingest, EMI module
  - Files: worker-ingest EMI parser, EMI board
  - Acceptance: New EMI from SMS fixture; due board; mark paid writes ledger note
  - Est: M

- [x] **U008-PRICE-DROP-ACT** · P1 · [Price] Price-drop card → watch / buy / dismiss with reason
  - Why: W029 is soft card; useful = decide
  - Depends: price-watches
  - Files: vault/today price card
  - Acceptance: Three actions; dismiss reason enum; no auto-checkout
  - Est: S

- [x] **U009-LOYALTY-POINTS-TRACK** · P1 · [Vault] Loyalty points balance + expiry (manual + ingest when present)
  - Why: points are found money users forget
  - Depends: credit kinds
  - Files: vault loyalty section
  - Acceptance: Add points balance; expiry badge; “use points” merchant link
  - Est: M

- [x] **U010-RECEIPT-TO-WARRANTY-RULES** · P0 · [Warranty] Auto-create warranty from receipt using merchant category rules
  - Why: UNIVERSE_TODO warranty auto-detect still open
  - Depends: OCR receipts
  - Files: warranty jobs, receipts confirm
  - Acceptance: Confirm receipt → warranty draft with lapse date; user can edit before save
  - Est: M

- [x] **U011-WARRANTY-CLAIM-PACKET** · P0 · [Warranty] One-tap claim packet (PDF/email body + attachments list)
  - Why: claim is the chore; prefilled deep-link alone isn’t enough
  - Depends: warranty claim
  - Files: warranty detail
  - Acceptance: Generates claim text + receipt keys; share sheet; undo claim 24h
  - Est: M

- [x] **U012-REFUND-TO-ORIGINAL-TENDER** · P1 · [Returns] Record refund destination (original card / store credit / UPI)
  - Why: “refund landed” needs where it went for reconcile
  - Depends: refund ledger
  - Files: returns mark-refunded
  - Acceptance: Required destination enum; ledger metadata; accountant filter
  - Est: S

- [x] **U013-VAULT-SEARCH-FILTER** · P1 · [Vault] Search + filter by merchant, type, expiry window, balance&gt;0
  - Why: power users with 20+ cards can’t scroll
  - Depends: vault list
  - Files: vault.tsx
  - Acceptance: Debounced search; filter chips; empty copy; a11y labels
  - Est: S

- [x] **U014-MANUAL-CREDIT-IDEMPOTENCY-UI** · P0 · [Vault] Detect near-duplicate manual add (same merchant+amount±1d) before save
  - Why: prevents double-count found money
  - Depends: credits idempotency
  - Files: add credit sheet
  - Acceptance: Warning with Open existing / Add anyway; audit on override
  - Est: S

- [x] **U015-FAMILY-SHARE-BUDGET-CAP** · P1 · [Household] Shared vault view with per-member spend cap (view-only default)
  - Why: useful for household without oversharing PII
  - Depends: family-share, ACL
  - Files: household, vault share
  - Acceptance: Cap enforced on mark-spent; ACL error copy; no raw card numbers shared
  - Est: M

---

# Cluster 2 · Returns, packages, claims (U016–U030) · P0/P1 · Wave U2

- [ ] **U016-RETURN-REASON-CODES** · P1 · [Returns] Structured reason codes → size-map + RTO analytics
  - Why: “wrong size” must feed size tip usefully
  - Depends: W036 size-map
  - Files: initiate return
  - Acceptance: Enum reasons; stored on return; size tip only when SIZE_*
  - Est: S

- [ ] **U017-PORTAL-FIELD-CHECKLIST** · P0 · [Returns] Merchant portal field checklist (order id, SKU, reason) before leave-app
  - Why: one-tap portal fails when user lacks fields
  - Depends: W032 portal
  - Files: ReturnsPanel
  - Acceptance: Checklist from purchase graph; copy-to-clipboard each; then Open portal
  - Est: M

- [ ] **U018-TRACKING-PASTE** · P0 · [Packages] Paste tracking number → carrier detect + status poll stub
  - Why: arriving-soon chore without full carrier contracts
  - Depends: packages track
  - Files: PackagesPanel
  - Acceptance: Parse carrier from pattern; save tracking; manual status set; deep link
  - Est: M

- [ ] **U019-PICKUP-RESCHEDULE** · P1 · [Returns] Reschedule / cancel pickup without restarting return
  - Why: life happens; restart is not usable
  - Depends: W033 pickup
  - Files: returns pickup
  - Acceptance: Reschedule slot; cancel → prior state; audit
  - Est: S

- [ ] **U020-REFUND-CHASE-NUDGE** · P0 · [Returns] If past merchant ETA and not ledger-credited → chase checklist
  - Why: refund chase is the painful chore
  - Depends: W034 ETA
  - Files: returns refund board
  - Acceptance: Chase steps (portal / chat / bank); snooze; escalate flag for ops
  - Est: M

- [ ] **U021-EXCHANGE-SIZE-PREFILL** · P1 · [Returns] Exchange flow prefills recommended size from size-map
  - Why: closes return→rebuy usefully
  - Depends: W036, N10 exchange
  - Files: exchange initiate
  - Acceptance: Prefill + edit; never auto-submit; analytics
  - Est: S

- [ ] **U022-MULTI-ITEM-RETURN-SPLIT** · P1 · [Returns] Split multi-item order into per-item returns
  - Why: users return one SKU not whole order
  - Depends: purchase items
  - Files: returns create
  - Acceptance: Select items; separate windows; one initiate per item
  - Est: M

- [ ] **U023-RTO-ADDRESS-FIX** · P1 · [Packages] RTO → edit delivery address / reattempt CTA
  - Why: recovery beyond refund
  - Depends: W037 RTO
  - Files: PackagesPanel RTO
  - Acceptance: Save address note; reattempt status; optional refund path kept
  - Est: S

- [ ] **U024-DELIVERY-PHOTO-PROOF** · P2 · [Packages] Attach delivery/damage photo to dispute packet
  - Why: useful evidence for failed delivery / damage
  - Depends: R2 upload
  - Files: packages dispute
  - Acceptance: Photo upload; linked to package; export in claim packet
  - Est: M

- [ ] **U025-RETURN-WINDOW-OVERRIDE** · P1 · [Returns] User-correctable window end date with audit
  - Why: merchant emails disagree with defaults
  - Depends: merchant windows
  - Files: return detail
  - Acceptance: Edit window; reason; audit `return.window.corrected`; push reschedule
  - Est: S

- [x] **U026-GST-INVOICE-REQUEST** · P1 · [Returns] Request missing GST invoice (template email / ticket)
  - Why: India tax chore when invoice absent
  - Depends: W041 GST jump
  - Files: returns / receipts
  - Acceptance: Prefills merchant request; marks invoice_requested; vault link when arrives
  - Est: S

- [x] **U027-COOLING-OFF-TIMER** · P1 · [Vault] Cooling-off purchase timer with cancel CTA where merchant supports
  - Why: impulse undo is useful money save
  - Depends: cooling-off module
  - Files: vault / packages
  - Acceptance: Timer; Cancel deep link when URL known; else checklist
  - Est: M

- [x] **U028-WARRANTY-VS-RETURN-ROUTER** · P1 · [Vault] Broken item → return window vs warranty claim router
  - Why: users pick wrong path and lose money
  - Depends: windows + warranty
  - Files: vault item actions
  - Acceptance: Decision tree; one primary CTA; explain why
  - Est: S

- [x] **U029-SELLER-RETURN-LABEL** · P2 · [Returns] Store return label / QR for pickup agent
  - Why: doorstep return fails without label
  - Depends: pickup book
  - Files: returns detail
  - Acceptance: Upload/generate label image; show offline; mark used
  - Est: M

- [x] **U030-PACKAGE-HOUSEHOLD-ASSIGN** · P2 · [Household] Assign incoming package to household member
  - Why: shared address chaos
  - Depends: households
  - Files: packages, household
  - Acceptance: Assignee chip; notify member; ACL respected
  - Est: S

---

# Cluster 3 · Today + wardrobe ops (U031–U040) · P1 · Wave U3

- [ ] **U031-WEAR-LOG-BATCH** · P1 · [Today] Batch “wore these” for multi-piece outfit in one tap
  - Why: friction kills wear-log usefulness
  - Depends: wear-log
  - Files: today.tsx
  - Acceptance: One confirm logs all pieces + accessories; undo 10m
  - Est: S

- [ ] **U032-LAUNDRY-BASKET-RULES** · P1 · [Wardrobe] Auto-dirty after N wears or sweat tag; mark-clean batch
  - Why: outfit ranking fails on dirty unknowns
  - Depends: laundry state
  - Files: wardrobe, today
  - Acceptance: Rule settings; batch clean; today respects dirty
  - Est: M

- [ ] **U033-OUTFIT-PIN-WEEK** · P1 · [Today] Pin outfit to calendar day (survives re-roll)
  - Why: planning is a chore, not just swipe delight
  - Depends: week strip
  - Files: today week
  - Acceptance: Pin/unpin; re-roll skips pinned; conflict warn
  - Est: S

- [ ] **U034-MISSING-LAYER-SHOP** · P1 · [Wardrobe] Weather/occasion missing layer → shop list (affiliate optional)
  - Why: useful gap fill beyond “missing piece” wow sheet
  - Depends: missing-piece, weather
  - Files: today / wardrobe
  - Acceptance: Gap reason; 1–3 suggestions; dismiss; Closet-framed
  - Est: M

- [ ] **U035-DISPOSE-DECISION-TREE** · P0 · [Waste] Sell / donate / barter / keep decision with next action
  - Why: UNIVERSE_TODO dispose still open as chore
  - Depends: disposition
  - Files: waste / wardrobe
  - Acceptance: Tree → creates disposition job or keep snooze; no Play blend
  - Est: M

- [ ] **U036-CPW-THRESHOLD-ALERT** · P1 · [Waste] Alert when cost-per-wear above user threshold
  - Why: CPW must drive action
  - Depends: waste ROI
  - Files: wardrobe item, accountant
  - Acceptance: Threshold in prefs; banner; deep link dispose/wear challenge
  - Est: S

- [ ] **U037-FIT-MEASURE-UPDATE** · P1 · [Fit] Update measurement with history + “what changed” note
  - Why: blouse reorder fails on stale measures
  - Depends: fit vault
  - Files: fit.tsx
  - Acceptance: Versioned measures; note; reorder uses latest
  - Est: S

- [ ] **U038-TAILOR-STATUS-CHASE** · P2 · [Fit] Tailor order status chase + pickup reminder
  - Why: marketplace order is a chore until received
  - Depends: tailor state machine
  - Files: fit / packages-like board
  - Acceptance: Status timeline; T-1d pickup nudge; mark received
  - Est: M

- [ ] **U039-BORROW-DUE-ENFORCE** · P1 · [Wardrobe] Lent item due date → overdue actions (nudge / mark returned / lost)
  - Why: overdue banner alone isn’t enough
  - Depends: borrow-lent
  - Files: wardrobe lend
  - Acceptance: Three actions; lost writes waste note; analytics
  - Est: S

- [ ] **U040-PHOTO-DUMP-TRIAGE** · P1 · [Concierge] Photo-dump → keep / wardrobe / discard triage queue
  - Why: batch review must finish the job
  - Depends: N55 photo-dump, W070
  - Files: photo dump review
  - Acceptance: Queue with decisions; progress; undo; audited
  - Est: M

---

# Cluster 4 · Ingest accuracy + trust ops (U041–U050) · P0/P1 · Wave U4

- [ ] **U041-PARSE-CORRECTION-TRAIN** · P0 · [Ingest] User correction writes training fixture stub + merchant hint
  - Why: HITL must improve parsers (UNIVERSE_TODO Track 9)
  - Depends: fix-parse inline (W075)
  - Files: ingestion correct, worker fixtures folder policy
  - Acceptance: Correction → audited event + optional fixture export job; never raw body in analytics
  - Est: M

- [ ] **U042-UNKNOWN-MERCHANT-QUEUE** · P1 · [Ingest] Unknown merchant → user pick canonical merchant or create alias
  - Why: wrong merchant breaks returns windows + vault merge
  - Depends: ingestion activity
  - Files: metrics / activity feed
  - Acceptance: Picker; alias map; reprocess window fields
  - Est: M

- [ ] **U043-MUTE-SENDER-RULES** · P1 · [Ingest] Mute sender / subject pattern with preview of what stops
  - Why: promo noise destroys trust
  - Depends: mute in ingest
  - Files: consent / metrics
  - Acceptance: Mute rule; preview count; undo 7d
  - Est: S

- [ ] **U044-CONSENT-SCOPE-DIFF** · P0 · [Trust] Show last sync: what scopes used + doc counts (no bodies)
  - Why: “what we read” must be ongoing, not one-shot
  - Depends: W074 sync feed
  - Files: consent, metrics
  - Acceptance: Scope chips + counts; revoke from same screen
  - Est: S

- [ ] **U045-RETENTION-COUNTDOWN** · P1 · [Trust] Per-doc retention countdown + “delete raw now”
  - Why: retention policy must be user-operable
  - Depends: retention module
  - Files: privacy / vault
  - Acceptance: Countdown; delete raw keeps structured purchase; confirm
  - Est: M

- [ ] **U046-MONEY-RECONCILE-UI** · P0 · [Accountant] Surface reconcile mismatches with fix actions
  - Why: ledger vs cache drift is a trust chore
  - Depends: money-reconcile job
  - Files: accountant
  - Acceptance: List mismatches; Recalc / Open account; mark investigated
  - Est: M

- [ ] **U047-BUDGET-ENFORCE-SOFT** · P1 · [Accountant] Soft block Play checkout bridge when over budget (Closet CTA only)
  - Why: spend-awareness without blended screen
  - Depends: budget, Play bridge
  - Files: bridge CTA, budget
  - Acceptance: Soft warn + Continue / Cut spend; never hard-block pay inside Closet
  - Est: S

- [ ] **U048-REGION-PACK-DEFAULTS** · P1 · [Fit] Onboarding region pack sets merchants, festivals, size systems
  - Why: useful defaults beat empty Global EN
  - Depends: region-packs, W092
  - Files: onboarding, fit
  - Acceptance: IN/US/UK pack applies festivals + size labels; changeable later
  - Est: M

- [ ] **U049-OCCASION-GIFT-DEADLINE** · P2 · [Gifts] Occasion deadline → shortlist + budget lock
  - Why: gift engine useful chore (not full P4 ranking)
  - Depends: gift occasions
  - Files: gifts / recipients
  - Acceptance: Deadline board; shortlist 3; budget lock; reminder T-7/T-2
  - Est: M

- [ ] **U050-OPS-PARSER-BREAK-USER** · P1 · [Ops] When merchant parser breaks → user banner “scanning delayed” + manual add CTA
  - Why: silent miss is worse than honest delay
  - Depends: ops playbooks, ingestion metrics
  - Files: vault banner, metrics
  - Acceptance: Banner from health flag; Add manually; dismiss; no fake credits
  - Est: S

---

## Suggested sequencing

1. **U1 first (U001–U015):** money truth — protects the found-money brand.
2. **U2 (U016–U030):** returns chase completion — second Closet job.
3. **U3 (U031–U040):** daily ops so Today/Wardrobe stay accurate.
4. **U4 (U041–U050):** ingest/trust loops — accuracy compound interest.

Skip or defer any ticket that only adds motion/copy without a completable chore (those belong in WOW-100).

---

## Out of scope here

- Live Gmail staging proof (`INGEST-GMAIL-E2E`)
- Counsel wet-ink / real pentest (`TRUST-DPDP-GDPR`, `TRUST-PENTEST`)
- Pure Play checkout copy (`W040`) — keep on Play surface only
- Re-listing shipped Universe `N##` / `WV##` / WOW `W###`
