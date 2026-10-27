# WORN — WOW-100 (usable + wow backlog)

> Next **100** Closet-first tickets after Universe Waves 0–4 scaffolding. Synced 2026-08-26 from ethos in `UNIVERSE_ARCHITECTURE.md`, `GTM_ZERO_SPEND.md`, `.cursor/skills/worn-gtm/SKILL.md`.
>
> **Companion:** Universe sequencing stays in [`UNIVERSE_DETAILED_TODO.md`](./UNIVERSE_DETAILED_TODO.md). Job-completing utility (not polish): [`UNIVERSE_USEFUL50.md`](./UNIVERSE_USEFUL50.md). This file is additive — do **not** re-list shipped Universe `N##` / `WV##` tickets.
>
> **Legend** — priority `P0`–`P2` · Est `S` (&lt;2d) | `M` (2–5d) · Status `MISSING` until verified · IDs `W001`–`W100`.
> `[ ]` only — mark `[x]` only after verifying shipped code in-session.

---

## Ethos guardrails (non-negotiable)

1. **Two surfaces stay separate** — Play = delight; Closet = utility/money; bridges only via explicit CTAs.
2. **Found-money aha without public Gmail** — manual / SMS / receipt first; trust framing always.
3. **Ingestion is a platform** — one purchase graph; never “AI fashion OS” without a single job.
4. **Trust bar** — consent, revoke, export/delete; no PII in share cards.
5. **India + Global EN** — ₹/$ aware; regional packs, not India-only.
6. **SLC** — each ticket deepens *one* lovable job: found money **or** today’s outfit **or** returns chase.

**Anti-patterns excluded:** blended Play+Closet screens, Gmail-required aha, coupon spam, bank/wallet positioning, speculative modules without daily/weekly use.

---

## Waves

| Wave | IDs | Theme | Exit |
|------|-----|--------|------|
| **A** | W001–W030 | First-session usable + found-money wow (+ trust slice) | &lt;60s aha feels polished; trust strip + expiry delight |
| **B** | W031–W058 | Returns chase + Today outfit wow | Deadline chase + morning reopen delight |
| **C** | W059–W100 | Wardrobe + bridges + growth + reliability | Habit polish + share/regional + cold-start |

---

# Cluster A · First-session usable (W001–W015) · P0 · Wave A

- [x] **W001-DEMO-EXIT-CLEAR** · P0 · [Onboarding] Demo sample exit is unmistakable
  - Why: users must know sample ₹500 is not real money
  - Status: SHIPPED (2026-08-26) — Demo badge + Exit sample; `demo_exited`
  - Depends: ONB-60S-AHA (shipped)
  - Files: `apps/mobile/app/(closet)/onboarding.tsx`, vault empty demo, `emptyDemo.ts`
  - Acceptance: met — Demo badge on sample credit; Exit sample clears ledger + `demo_exited`
  - Est: S

- [x] **W002-OFFLINE-VAULT-ADD** · P0 · [Vault] Add gift card works offline then syncs
  - Why: metro/subway aha must not depend on flaky network
  - Status: SHIPPED (2026-08-26) — queue + idempotent flush; error banner
  - Depends: none
  - Files: `apps/mobile` vault add queue, `POST /credits` retry
  - Acceptance: met — Offline add queues; online flush idempotent; error banner if flush fails
  - Est: M

- [x] **W003-CURRENCY-PICKER** · P0 · [Onboarding] IN ₹ / US $ / UK £ picker on first Closet entry
  - Why: Global EN + India parallel GTM
  - Status: SHIPPED (2026-08-26) — locale seed; persisted; vault totals format
  - Depends: none
  - Files: closet store prefs, `formatMinor`, onboarding
  - Acceptance: met — Default from locale; persisted; vault totals format correctly
  - Est: S

- [x] **W004-EMPTY-COPY-AB** · P0 · [UX] Empty-state copy variants (found-money vs outfit job)
  - Why: first blank screen must sell one job
  - Status: SHIPPED (2026-08-26) — AB/env; vault/wardrobe/today; `empty_cta_tap`
  - Depends: ONB-EMPTY-DEMO
  - Files: vault/wardrobe/today empty props
  - Acceptance: met — Flag or rotate 2 copy sets; analytics `empty_cta_tap`
  - Est: S

- [x] **W005-CLOSET-RESTORE-SAFE** · P0 · [Mobile] Crash-safe Closet surface restore
  - Why: cold reopen must land Closet without white screen
  - Status: SHIPPED (2026-08-26) — corrupt → Play + toast; vitest hydrate
  - Depends: none
  - Files: `_layout.tsx`, closet store hydrate
  - Acceptance: met — Corrupt AsyncStorage falls back to Play + toast; vitest hydrate
  - Est: S

- [x] **W006-SURFACE-TOGGLE-EDU** · P0 · [UX] First Play⇄Closet toggle education sheet
  - Why: two-surface ethos — users must not think they’re the same app
  - Status: SHIPPED (2026-08-26) — one-time sheet; Skip available
  - Depends: none
  - Files: surface switcher UI
  - Acceptance: met — One-time sheet: Play = try-on, Closet = money/wardrobe; Skip available
  - Est: S

- [x] **W007-CELEBRATION-VARIANTS** · P0 · [Vault] First-credit celebration variants (manual/oauth/demo)
  - Why: delight must match source without overselling
  - Status: SHIPPED (2026-08-26) — distinct copy/haptic; Reduce Motion safe
  - Depends: ONB-60S-AHA
  - Files: vault celebration, `firstDelight.ts`
  - Acceptance: met — Distinct copy/haptic per source; Reduce Motion safe
  - Est: S

- [x] **W008-SKIP-PATH-ANALYTICS** · P0 · [Obs] Skip onboarding / skip email funnel events
  - Why: GTM must know if aha is abandoned
  - Status: SHIPPED
  - Depends: OBS-ANALYTICS-SINK
  - Files: analytics events, onboarding
  - Acceptance: `onboarding_skipped`, `email_prompt_skipped` with `{seconds}`
  - Est: S

- [x] **W009-RECEIPT-SNAP-HERO** · P0 · [Vault] Receipt snap shortcut from vault hero
  - Why: warranty aha without digging tabs
  - Status: SHIPPED (2026-08-26) — hero CTA → camera/OCR; confidence badge on review
  - Depends: WV03-OCR-REAL
  - Files: `vault.tsx`, `receiptSnap.ts`
  - Acceptance: met — one tap opens camera/OCR; returns with confidence badge
  - Est: S

- [x] **W010-SMS-PERM-MICROCOPY** · P0 · [Ingest] Android SMS permission microcopy (order texts only)
  - Why: trust — never overclaim inbox read
  - Status: SHIPPED (2026-08-26) — `smsPermCopy` + PermissionsAndroid / connect-email Android UI; deny path stays usable
  - Depends: INGEST-SMS-ANDROID
  - Files: `apps/mobile/src/lib/smsPermCopy.ts`, `sms.ts`, `smsAndroidAdapter.ts`, `connect-email.tsx`
  - Acceptance: met — order/shipping/gift-card texts only; vitest perm copy + adapter dialog
  - Est: S

- [x] **W011-IOS-FORWARD-WIZARD** · P0 · [Ingest] iOS forwarding-address wizard
  - Why: iOS cannot read SMS; forwarding is the only path
  - Status: SHIPPED (2026-08-26) — stepper create address → Mail rule → test ping; `IosForwardWizard`; no READ_SMS marketing
  - Depends: none
  - Files: `apps/mobile/src/lib/iosForwardWizard.ts`, `components/IosForwardWizard.tsx`, `connect-email.tsx`
  - Acceptance: met — 3-step wizard; vitest steps + component; no READ_SMS
  - Est: M

- [x] **W012-FOUND-MONEY-COUNTUP** · P0 · [Vault] Found-money total count-up animation
  - Why: wow on reveal without gimmick
  - Status: SHIPPED (2026-08-26) — once per session; Reduce Motion skip; `formatMinor`
  - Depends: none
  - Files: `FoundMoneyCountUp.tsx`, `foundMoneyCountUp.ts`, vault hero
  - Acceptance: met — animates once per session; skipped under Reduce Motion
  - Est: S

- [x] **W013-ADD-ANOTHER-CARD** · P0 · [Vault] “Add another” after first successful credit
  - Why: multi-card vault depth in first session
  - Status: SHIPPED (2026-08-26) — primary CTA when ≥1 card; `add_another_tap`
  - Depends: none
  - Files: vault post-add CTA
  - Acceptance: met — primary “Add another”; analytics `add_another_tap`
  - Est: S

- [x] **W014-TRUST-STRIP-ALWAYS** · P0 · [Trust] Persistent trust strip on vault (read-only / revoke / delete)
  - Why: GTM trust copy must match product chrome
  - Status: SHIPPED (2026-08-26) — always-visible strip → consent / export-delete
  - Depends: TRUST-EXPORT-UI
  - Files: `VaultTrustStrip.tsx`, vault header
  - Acceptance: met — always visible on vault; links consent + export/delete
  - Est: S

- [x] **W015-EMAIL-CTA-COPY** · P0 · [Onboarding] Progressive email CTA copy refresh (after aha only)
  - Why: Gmail ask must follow found-money, never precede
  - Status: SHIPPED (2026-08-26) — “Find more credits”; Limited Use adjacent; Skip always
  - Depends: ONB-PROGRESSIVE-PERMS
  - Files: `ProgressivePermPrompt`, `progressivePerms.ts`
  - Acceptance: met — find more credits; Limited Use adjacent; Skip always
  - Est: S

---

# Cluster B · Found-money wow (W016–W030) · P0/P1 · Wave A

- [x] **W016-EXPIRY-COUNTDOWN-HERO** · P0 · [Vault] Soonest-expiry countdown hero
  - Why: urgency is the vault wow
  - Status: SHIPPED (2026-08-26) — soonest days/hours hero; push `focus=expiry`
  - Depends: PUSH-LIVE-QUIET
  - Files: `ExpiryCountdownHero.tsx`, `vaultWow.ts`, vault hero; CREDIT_EXPIRY deep link
  - Acceptance: met — days/hours to soonest expiry; push deep link lands on hero
  - Est: S

- [x] **W017-USE-THIS-WEEKEND** · P1 · [Vault] “Use it this weekend” plan chip
  - Why: converts found money into action
  - Status: SHIPPED (2026-08-26) — chip → merchant deep link + Sat calendar reminder; `use_this_weekend_tap`
  - Depends: merchant deep links
  - Files: vault credit row CTA, `vaultWow.ts`, ClosetAffiliateSource `use_this_weekend`
  - Acceptance: met — chip opens merchant deep link + optional calendar reminder
  - Est: S

- [x] **W018-DEEPLINK-SUCCESS-TOAST** · P1 · [Vault] Merchant deep-link success toast
  - Why: feedback that “Use it now” worked
  - Status: SHIPPED (2026-08-26) — AppState return toast (no PII); `merchant_deeplink_return`
  - Depends: none
  - Files: vault / cashback click, `deeplinkSuccessToastCopy`
  - Acceptance: met — toast on return after open; no PII
  - Est: S

- [x] **W019-MULTI-CARD-STACK** · P1 · [Vault] Multi-card stack visual for ≥3 credits
  - Why: vault feels full of money, not a spreadsheet
  - Status: SHIPPED (2026-08-26) — stack for ≥3; a11y label includes totals
  - Depends: none
  - Files: `MultiCardStack.tsx`, vault gift-card tab, `multiCardStack*`
  - Acceptance: met — stack for ≥3; a11y labels totals
  - Est: M

- [x] **W020-SOONEST-FOCUS-MODE** · P1 · [Vault] Soonest-expiring focus mode filter
  - Why: usable triage when many cards
  - Status: SHIPPED (2026-08-26) — session toggle expiry ASC; `soonest_focus_toggled`
  - Depends: W016
  - Files: vault filters, closet store `soonestFocusMode`
  - Acceptance: met — toggle sorts/filter by expiry ASC; persists session
  - Est: S

- [x] **W021-BALANCE-RECHECK-UX** · P1 · [Vault] Balance re-check nudge UX
  - Why: balances drift; manual re-check is the honest path
  - Status: SHIPPED (2026-08-26) — due nudge + recheck/remind/open; `balance_recheck_tap` / `balance_recheck_reminder`
  - Depends: WV02-BALANCE-CHECK (or stub reminder)
  - Files: credit detail, `balanceRecheckNudgeCopy`
  - Acceptance: met — recheck schedules reminder or opens merchant; analytics
  - Est: S

- [x] **W022-LOYALTY-TAB-DELIGHT** · P1 · [Vault] Loyalty / coupon tab delight empty→first
  - Why: India high-frequency aha sibling to GC
  - Status: SHIPPED (2026-08-26) — empty CTA + first celebration; Reduce Motion skips haptic; `loyalty_first_celebration`
  - Depends: N07/N08 shipped
  - Files: vault loyalty tab, `loyaltyTabEmptyCopy` / `loyaltyFirstCelebrationCopy`
  - Acceptance: met — empty CTA + first-points celebration (Reduce Motion safe)
  - Est: S

- [x] **W023-SHARE-WA-IN-TEMPLATE** · P1 · [Growth] WhatsApp IN share template for found-money
  - Why: soft K-factor without PII
  - Status: SHIPPED (2026-08-26) — `buildWhatsAppInFoundMoneyShare` + vault WA share; blurred total; no merchants/digits
  - Depends: GROW-FOUND-SHARE
  - Files: share card builder, vault share
  - Acceptance: met — prefilled WA text with blurred total; no merchant names/digits
  - Est: S

- [x] **W024-FAMILY-SHARE-UI** · P1 · [Social] Family share attribution UI polish
  - Why: household money finds need clear credit
  - Status: SHIPPED (2026-08-26) — `shared via worn.app/r/…` under vault share + `/(closet)/family-share` confirm
  - Depends: N36-FAMILY-SHARE
  - Files: vault share + referrals
  - Acceptance: met — “shared via worn.app/r/…”; attribution confirm screen
  - Est: S

- [x] **W025-QUIET-HOURS-PREVIEW** · P1 · [Notif] Quiet-hours preview (“next send at …”)
  - Why: trust + usable notification prefs
  - Status: SHIPPED (2026-08-26) — `formatQuietHoursNextSendPreview` + QuietHoursEditor on consent
  - Depends: PUSH-LIVE-QUIET
  - Files: vault prefs / notification settings
  - Acceptance: met — shows next eligible send time in user TZ
  - Est: S

- [x] **W026-DIGEST-STILL-HAVE** · P1 · [Notif] Weekly digest “you still have ₹/$X”
  - Why: reopen without spam
  - Status: SHIPPED (2026-08-26) — weekly digest stillHaveMinor + vault deep link; caps respected
  - Depends: NOTIF-REENGAGE
  - Files: nudge-jobs, digest copy
  - Acceptance: met — cap respected; copy uses formatMinor; deep link vault
  - Est: S

- [x] **W027-BARCODE-SUCCESS-DELIGHT** · P1 · [Vault] Barcode/photo capture success haptic + confetti
  - Why: physical card → vault wow
  - Status: SHIPPED (2026-08-26) — shared `barcodeSuccessFeedback` + vault capture; Reduce Motion → haptic-only
  - Depends: WV02-BARCODE
  - Files: `delight-haptics.ts`, `barcodeCaptureDelight.ts`, `vault.tsx`
  - Acceptance: met — success feedback; Reduce Motion → haptic-only; web none; vitest
  - Est: S

- [x] **W028-WARRANTY-CLAIM-SUCCESS** · P1 · [Vault] Warranty claim one-tap success state
  - Why: claim rail must feel finished
  - Status: SHIPPED (2026-08-26) — CLAIMED UI + undo (`POST /warranties/:id/unclaim`) + snooze
  - Depends: WV03-CLAIM-RAIL
  - Files: vault warranties tab
  - Acceptance: met — after claim open, UI shows CLAIMED + undo/snooze
  - Est: S

- [x] **W029-PRICE-DROP-ALERT-CARD** · P1 · [Recover] Price-drop alert card in vault/today
  - Why: owned-brand drop is wow without new shopping addiction
  - Status: SHIPPED (2026-08-26) — `PriceDropAlertCards` soft card; dismissible; tap → listing
  - Depends: N12-PRICE-DROP
  - Files: vault/today cards
  - Acceptance: met — soft card with threshold hit; tap → listing; dismissible
  - Est: S

- [x] **W030-EMI-DONT-MISS** · P1 · [Recover] EMI due “don’t miss” card
  - Why: fashion EMI is India-real pain
  - Status: SHIPPED (2026-08-26) — due-within-7d card; mark paid; `worn://accountant?focus=emi` deep link
  - Depends: N13-BNPL-EMI
  - Files: vault / accountant surface
  - Acceptance: met — due-within-7d card; mark paid; push deep link
  - Est: S

---

# Cluster C · Returns chase usable (W031–W042) · P0/P1 · Wave B

- [x] **W031-RETURNS-URGENCY-SORT** · P0 · [Returns] Default sort by window deadline ASC
  - Why: “3 days left” must be first
  - Status: SHIPPED (2026-08-26) — `partitionReturnsByDeadline` ASC + collapsed expired; ReturnsPanel + wowW031W036
  - Depends: WV01-MOBILE-UNIFY
  - Files: ReturnsPanel, `returnsPolish.ts`
  - Acceptance: Soonest deadline first; expired section collapsed
  - Est: S

- [x] **W032-MERCHANT-PORTAL-ONETAP** · P0 · [Returns] One-tap merchant return portal
  - Why: draft return aha
  - Status: SHIPPED (2026-08-26) — Open portal CTA → `merchantReturnUrl` + `return_portal_open`
  - Depends: WV01-PICKUP-BOOK
  - Files: ReturnsPanel initiate
  - Acceptance: Opens `merchantReturnUrl`; analytics `return_portal_open`
  - Est: S

- [x] **W033-PICKUP-SLOT-CAL** · P1 · [Returns] Pickup slot calendar UX
  - Why: PICKUP_SCHEDULED must be choosable
  - Status: SHIPPED (2026-08-26) — slot chips + ±1h → `POST /returns/:id/pickup`; shows booked slot
  - Depends: WV01-PICKUP-BOOK
  - Files: returns pickup UI, `bookReturnPickup`, `useBookReturnPickup`
  - Acceptance: Date/time picker → `POST /returns/:id/pickup`; shows slot
  - Est: M

- [x] **W034-REFUND-ETA-CLOCK** · P1 · [Returns] Refund ETA live clock
  - Why: usable chase until ledger credit
  - Status: SHIPPED (2026-08-26) — `refundEtaLiveLabel` via `useNow`; `ledgerCredited` celebration copy
  - Depends: N16-REFUND-ETA
  - Files: ReturnsPanel refund board
  - Acceptance: Live-updating ETA; `ledgerCredited` celebration
  - Est: S

- [x] **W035-MARK-REFUNDED-CELEBRATE** · P1 · [Returns] Mark-refunded celebration
  - Why: money-back wow
  - Status: SHIPPED (2026-08-26) — haptic + toast + banner; Refund ledger row when Vault tab
  - Depends: WV01-REFUND-LEDGER-UI
  - Files: ReturnsPanel, delightHaptics, `markRefundedCelebration`
  - Acceptance: Haptic + toast; ledger row visible
  - Est: S

- [x] **W036-SIZE-MAP-TIP** · P1 · [Returns] Size-map “buy this size next” tip
  - Why: closes the return→rebuy loop usefully
  - Status: SHIPPED (2026-08-26) — `buildSizeMapTip` / dismissible tip on detail; `GET /returns/size-map`
  - Depends: N17-SIZE-MAP
  - Files: returns detail / size-map, `fetchSizeMap`
  - Acceptance: Tip from brand aggregate; dismissible
  - Est: S

- [x] **W037-RTO-CHECKLIST-UX** · P1 · [Packages] RTO checklist UX polish
  - Why: failed delivery recovery must be usable
  - Status: SHIPPED (2026-08-26) — PackagesPanel RTO board with checklist steps + Start refund CTA; `useRtoRecovery` / `useStartRtoRefund`
  - Depends: N15-RTO-RECOVERY
  - Files: `PackagesPanel.tsx`, packages client/hooks, `packages/rto-recovery`
  - Acceptance: met — Checklist steps + start-refund CTA; vitest PackagesPanel
  - Est: S

- [x] **W038-EXCHANGE-VS-RETURN-CTA** · P1 · [Packages] Exchange vs return dual CTA clarity
  - Why: windows differ by merchant
  - Status: SHIPPED (2026-08-26) — when `windowsDiffer`, labeled Start exchange + Start return CTAs
  - Depends: N10-EXCHANGE-WINDOW
  - Files: `PackagesPanel.tsx`, `useCreateReturn`
  - Acceptance: met — When `windowsDiffer`, two labeled CTAs; vitest dual CTAs
  - Est: S

- [x] **W039-PACKAGE-TIMELINE** · P1 · [Packages] Delivery timeline polish
  - Why: arriving-soon usable
  - Status: SHIPPED (2026-08-26) — `packageDeliveryTimeline` status steps + ETA; mark delivered retained
  - Depends: N09-PACKAGE-TRACK
  - Files: `package-delivery.ts`, PackagesPanel vault tab
  - Acceptance: met — Status steps + ETA; mark delivered; shared + panel vitest
  - Est: S

- [x] **W040-DUP-REBUY-COPY** · P1 · [Play] Duplicate-rebuy soft warn copy polish
  - Why: anti-impulse without hard block
  - Status: SHIPPED (2026-08-27) — soft banner from prebuy overlaps; Closet wardrobe deep link; pay never gated
  - Depends: N11-DUP-REBUY
  - Files: `playDupRebuyBanner` in `dup-rebuy.ts`, `apps/mobile/app/checkout.tsx`
  - Acceptance: met — Soft banner; Closet deep link; never blocks pay; shared + checkout vitest
  - Est: S

- [x] **W041-GST-FROM-RETURNS** · P1 · [Returns] Jump to GST/invoice from return item
  - Why: India usable recover
  - Status: SHIPPED (2026-08-26) — Find GST/invoice → vault receipts with merchant/date prefill; export on tab
  - Depends: N18-GST-INVOICE
  - Files: `ReturnsPanel`, `gstFromReturn.ts`, vault ReceiptsTab
  - Acceptance: met — Prefills merchant/date; export available; vitest prefill/href
  - Est: S

- [x] **W042-DEADLINE-IMAGE-FALLBACK** · P1 · [Notif] Rich deadline push image fallback
  - Why: delight when imageKey missing
  - Status: SHIPPED (2026-08-26) — brand placeholder via storage key / env / static URL; enqueue still SENT
  - Depends: WV01-DEADLINE-IMAGE-PUSH
  - Files: `return-jobs.ts` enrich
  - Acceptance: met — Placeholder brand asset when no image; still SENT; vitest enrich + publish
  - Est: S

---

# Cluster D · Today outfit wow (W043–W058) · P1 · Wave B

- [x] **W043-7AM-AVATAR-REVEAL** · P1 · [Today] 7am push open → avatar outfit reveal
  - Why: morning wow on own clothes
  - Status: SHIPPED (2026-08-26) — `worn://today` / `?focus=outfit` reveal overlay; Reduce Motion instant; OUTFIT_READY deep link includes focus
  - Depends: WV04-7AM-PUSH
  - Files: `AvatarOutfitReveal.tsx`, `todayWow.ts`, today.tsx, push-delivery
  - Acceptance: met — focuses outfit + short reveal motion (Reduce Motion safe)
  - Est: S

- [x] **W044-SWIPE-ALT-PHYSICS** · P1 · [Today] Swipe alternatives physics polish
  - Why: usable alt browsing
  - Status: SHIPPED (2026-08-26) — alt index clamp + slide; Use this look commits; Reduce Motion skips slide
  - Depends: WV04-SWIPE-ALT
  - Files: today.tsx Prev/Next, `todayWow.ts`
  - Acceptance: met — smooth alt index; “Use this look” commits
  - Est: S

- [x] **W045-WEATHER-REROLL-BANNER** · P1 · [Today] Weather re-roll banner before noon
  - Why: wow when weather shifts
  - Status: SHIPPED (2026-08-26) — tappable banner when `weatherRerolled`; accept commits look
  - Depends: N06-WEATHER-REROLL
  - Files: today banner, `todayWow.ts`
  - Acceptance: met — Banner when `weatherRerolled`; tap accepts new look
  - Est: S

- [x] **W046-WEEK-STRIP-DRAG** · P1 · [Today] Week strip drag-to-plan
  - Why: usable week calendar
  - Status: SHIPPED (2026-08-26) — Assign to day + long-press; `PATCH /outfits/week/:date`
  - Depends: N01-WEEK-CAL
  - Files: today week strip, `patchWeekDayOutfit`, `usePatchWeekOutfit`
  - Acceptance: met — tap-assign / long-press day; PATCH week date
  - Est: M

- [x] **W047-AVOID-REPEAT-CHIPS** · P1 · [Today] Avoid-repeat explanation chips
  - Why: trust the generator
  - Status: SHIPPED (2026-08-26) — chips from whyThis exclusion lines
  - Depends: N02-AVOID-REPEAT
  - Files: `todayWow.avoidRepeatChips`, today whyThis UI
  - Acceptance: met — Chip when piece excluded for recent wear
  - Est: S

- [x] **W048-GOES-WITH-SHEET** · P1 · [Today] “What goes with” bottom sheet
  - Why: wow from owned items
  - Status: SHIPPED (2026-08-26) — sheet from item tap; ranked matches; try on today via PATCH
  - Depends: N05-WHAT-GOES-WITH
  - Files: `GoesWithSheet.tsx`, today.tsx
  - Acceptance: met — Ranked matches; tap tries on today
  - Est: S

- [x] **W049-CAL-IMPORT-SUCCESS** · P1 · [Today] Calendar import success state
  - Why: occasion outfits feel planned
  - Status: SHIPPED (2026-08-26) — toast with N outfits planned + night-before note
  - Depends: N03-CAL-EVENT-OUTFIT
  - Files: today From calendar, `calendarImportSuccessCopy`
  - Acceptance: met — Toast with N outfits planned; night-before note if set
  - Est: S

- [x] **W050-LAUNDRY-EMPTY-PROMPT** · P1 · [Today] Laundry empty → mark clean prompt
  - Why: generator starvation UX
  - Status: SHIPPED (2026-08-26) — when all dirty, Mark clean / Wear anyway CTAs
  - Depends: N04-LAUNDRY
  - Files: today laundry card, `laundryStarvationPrompt`
  - Acceptance: met — When all dirty, CTA to mark clean or wear anyway
  - Est: S

- [x] **W051-WEAR-PHOTO-FRICTION** · P1 · [Today] Wear-photo snap friction kill
  - Why: retention signal must be &lt;3 taps
  - Status: SHIPPED (2026-08-26) — Snap & log wear (camera-first ≤3 taps); recoverable retry
  - Depends: N19-PHOTO-WEARLOG
  - Files: `today.tsx`, `todayOccasionWow.ts`
  - Acceptance: Camera → upload → wear in ≤3 taps; error recoverable
  - Est: S

- [x] **W052-CAPSULE-TODAY** · P1 · [Today] Prefer “today from capsule”
  - Why: usable small closet
  - Status: SHIPPED (2026-08-26) — Today toggle → `preferCapsule` on week/generate
  - Depends: N32-CAPSULE
  - Files: `today.tsx`, `closetPrefs.ts`, outfits generate
  - Acceptance: Toggle constrains generator to capsule membership
  - Est: S

- [x] **W053-WORKWEAR-STRIP** · P1 · [Today] Workwear Mon–Fri strip
  - Why: weekday ritual
  - Status: SHIPPED (2026-08-26) — WORK badges + regenerate unique CTA
  - Depends: N28-WORKWEAR
  - Files: `today.tsx`, `todayOccasionWow.ts`
  - Acceptance: Shows Mon–Fri WORK plans; regenerate unique
  - Est: S

- [x] **W054-TRAVEL-PACK-SHARE** · P1 · [Today] Travel pack share sheet
  - Why: wow packing list
  - Status: SHIPPED (2026-08-26) — markdown share via `shareTextFile`; PII scrubbed
  - Depends: N24-TRAVEL-PACK
  - Files: `useTravelPack`, `todayOccasionWow.ts`
  - Acceptance: Share checklist; no PII
  - Est: S

- [x] **W055-SEASONAL-SWAP-MOTION** · P1 · [Wardrobe] Seasonal swap animation
  - Why: ACTIVE/STORED feels tangible
  - Status: SHIPPED (2026-08-26) — haptic + scale pulse; Reduce Motion → haptic-only
  - Depends: N23-SEASONAL-SWAP
  - Files: `wardrobe.tsx`, `delightHaptics.ts`
  - Acceptance: Motion/haptic on swap; Reduce Motion safe
  - Est: S

- [x] **W056-INTERVIEW-NIGHT-BEFORE** · P1 · [Today] Interview kit night-before UI confirm
  - Why: ceremony wow
  - Status: SHIPPED (2026-08-26) — confirm sheet with remindAt; edit/cancel via PATCH
  - Depends: N40-INTERVIEW-KIT
  - Files: `today.tsx`, interview-kit store + PATCH route
  - Acceptance: Shows remindAt; edit/cancel
  - Est: S

- [x] **W057-WEDDING-PLANNER-UI** · P1 · [Today] Wedding/festival multi-day planner UI
  - Why: peak-season wow
  - Status: SHIPPED (2026-08-26) — date span + optional envelope prompts
  - Depends: N39-WEDDING-FESTIVAL
  - Files: `today.tsx`, `todayOccasionWow.ts`
  - Acceptance: Date span → N day outfits + optional envelope
  - Est: M

- [x] **W058-COMPLETE-LOOK-SHEET** · P1 · [Bridge] Complete-look affiliate sheet
  - Why: owned + missing without blending surfaces
  - Status: SHIPPED (2026-08-27) — Closet-framed sheet; owned slots + affiliate fills; `recordClosetAffiliateClick` on tap
  - Depends: N52-COMPLETE-LOOK
  - Files: `complete-look-sheet.ts`, `CompleteLookSheet.tsx`, today/wardrobe
  - Acceptance: met — Owned slots + affiliate fills; cashback click recorded
  - Est: S

---

# Cluster E · Wardrobe usable (W059–W072) · P1 · Wave C

- [x] **W059-BULK-IMPORT-PROGRESS** · P1 · [Wardrobe] Bulk import progress UI
  - Why: usable multi-photo import
  - Status: SHIPPED (2026-08-26) — N/M progress + cancel + per-item errors
  - Depends: WV04-BULK-IMPORT (shipped)
  - Files: `bulk-import-progress.ts`, `apps/mobile/app/(closet)/wardrobe.tsx`
  - Acceptance: met — Progress N/M; cancel; errors per item
  - Est: S

- [x] **W060-AUTOTAG-CONFIRM** · P1 · [Wardrobe] Autotag confirm/edit before save
  - Why: vision must be correctable
  - Status: SHIPPED (2026-08-26) — confirm sheet; soft dup warn
  - Depends: WV04-AUTOTAG (shipped)
  - Files: `autotag-confirm.ts`, `AutotagConfirmSheet.tsx`, wardrobe bulk flow
  - Acceptance: met — Edit category/color/brand; dup warn soft
  - Est: S

- [x] **W061-CARE-LABEL-BADGE** · P1 · [Wardrobe] Care-label badge on item
  - Why: wash rules usable at a glance
  - Status: SHIPPED (2026-08-26) — badge + tap expand
  - Depends: N20-CARE-OCR (shipped)
  - Files: `careLabel.ts`, `CareLabelBadge.tsx`, wardrobe item row
  - Acceptance: met — Badge when `careRules` present; tap expands
  - Est: S

- [x] **W062-DRYCLEAN-HOME-TILE** · P1 · [Today] Dry-clean ticket home tile
  - Why: pickup day usable
  - Status: SHIPPED (2026-08-26) — IN_LAUNDRY + pickup tile on Today
  - Depends: N22-DRYCLEAN (shipped)
  - Files: `dry-clean-home.ts`, `apps/mobile/app/(closet)/today.tsx`
  - Acceptance: met — Tile when IN_LAUNDRY with pickup date
  - Est: S

- [x] **W063-LEND-OVERDUE-BANNER** · P1 · [Wardrobe] Lent overdue banner
  - Why: borrow/lent usable
  - Status: SHIPPED (2026-08-26) — overdue banner → mark returned
  - Depends: N25-BORROW-LENT (shipped)
  - Files: `borrow-lent.ts`, wardrobe banner
  - Acceptance: met — Banner for overdue; tap → return flow
  - Est: S

- [x] **W064-HOUSEHOLD-SWITCHER** · P1 · [Household] Switcher clarity + ACL errors
  - Why: shared closet usable
  - Status: SHIPPED (2026-08-26) — Active: label + friendly 403 copy
  - Depends: N26-HOUSEHOLD (shipped)
  - Files: `household.ts`, `apps/mobile/app/(closet)/household.tsx`
  - Acceptance: met — Clear active household; 403 → friendly copy
  - Est: S

- [x] **W065-KIDS-PROFILE-GUARD** · P1 · [Profiles] Kids profile guardrails copy
  - Why: multi-profile safety/clarity
  - Status: SHIPPED (2026-08-26) — confirm delete; SELF locked; profile-scoped list
  - Depends: N27-KIDS (shipped)
  - Files: `closet-profile.ts`, wardrobe profile chips, `GET /wardrobe?profileId=`
  - Acceptance: met — Confirm before delete profile; scoped lists only
  - Est: S

- [x] **W066-ACCESSORY-SLOT-TODAY** · P1 · [Today] Accessories slot on today outfit
  - Why: jewelry vault usable in ritual
  - Status: SHIPPED (2026-08-26) — Attach/swap on Today; wear_log via outfit.itemIds; accessories + AccessorySlotToday vitest
  - Depends: N30-ACCESSORIES
  - Files: `AccessorySlotToday.tsx`, `accessories.ts`, today outfit, `usePatchWeekOutfit`
  - Acceptance: Attach/swap accessory; wear updates metrics
  - Est: S

- [x] **W067-SHOE-BAG-NUDGE** · P1 · [Wardrobe] Shoe/bag rotation nudge
  - Why: least-worn rotate usable
  - Status: SHIPPED (2026-08-26) — Nudge cards from `GET /wardrobe/rotation`; ShoeBagRotationNudge + shoeBagNudge vitest
  - Depends: N29-SHOE-BAG
  - Files: `ShoeBagRotationNudge.tsx`, `shoeBagNudge.ts`, wardrobe
  - Acceptance: Nudge card from `GET /wardrobe/rotation`
  - Est: S

- [x] **W068-MISSING-PIECE-SHEET** · P1 · [Wardrobe] Missing-piece shop sheet
  - Why: shopping list wow from gaps
  - Status: SHIPPED (2026-08-26) — Affiliate CTAs + cashback click; MissingPieceShopSheet + missingPieceShop vitest
  - Depends: N31-MISSING-PIECE
  - Files: `MissingPieceShopSheet.tsx`, `missingPieceShop.ts`, wardrobe
  - Acceptance: Affiliate CTAs + cashback click
  - Est: S

- [x] **W069-REPAIR-COST-CHIP** · P1 · [Accountant] Repair log cost chip
  - Why: repairs visible in P&L
  - Status: SHIPPED (2026-08-26) — `repairSpendMinor` chip → REPAIR ledger; RepairSpendChip vitest
  - Depends: N21-REPAIR-LOG
  - Files: `RepairSpendChip.tsx`, `repairSpendChip.ts`, accountant
  - Acceptance: Shows `repairSpendMinor` chip; link to repairs
  - Est: S

- [x] **W070-PHOTO-DUMP-REVIEW** · P1 · [Concierge] Photo-dump batch review UI
  - Why: pre-human sort usable
  - Status: SHIPPED (2026-08-26) — Batch confirm/reject + progress; PhotoDumpReview + photoDumpReview vitest
  - Depends: N55-PHOTO-DUMP (or stub queue)
  - Files: `PhotoDumpReview.tsx`, `photoDumpReview.ts`, wardrobe, `usePhotoDump`
  - Acceptance: Batch confirm/reject tags; progress
  - Est: M

- [x] **W071-DECLUTTER-RING** · P1 · [Waste] Declutter challenge progress ring
  - Why: challenge wow
  - Status: SHIPPED (2026-08-26) — Ring N/goal + Share on complete on disposition; declutterRing + DeclutterProgressRing vitest
  - Depends: N54-DECLUTTER
  - Files: `declutterRing.ts`, `DeclutterProgressRing.tsx`, disposition
  - Acceptance: met — Ring N/goal; share on complete
  - Est: S

- [x] **W072-REWEAR-STREAK-CELEBRATE** · P1 · [Today] Rewear streak celebration
  - Why: sustainability wow
  - Status: SHIPPED (2026-08-26) — Milestone celebrate on Today; Reduce Motion → static + no haptic; rewearCelebrate vitest
  - Depends: N53-REWEAR-STREAK
  - Files: `rewearCelebrate.ts`, `RewearStreakCelebrate.tsx`, today
  - Acceptance: met — Milestone celebrate; Reduce Motion safe
  - Est: S

---

# Cluster F · Trust & clarity wow (W073–W082) · P0 · Wave A (slice) / Wave C

- [x] **W073-CONSENT-PLAIN-CARDS** · P0 · [Trust] Consent plain-language cards
  - Why: scopes must be human
  - Status: SHIPPED (2026-08-26) — EMAIL/SMS/FINANCIAL plain cards on Consent; revoke one tap; `consentPlainCards` + `consentCenter` vitest
  - Depends: TRUST-CONSENT-CENTER
  - Files: consent.tsx, `consentCenter.ts`
  - Acceptance: EMAIL/SMS/FINANCIAL cards in plain English; revoke one tap
  - Est: S

- [x] **W074-SYNC-FEED-AFTER** · P0 · [Ingest] “What we read” auto-open after sync
  - Why: kills Gmail fear
  - Status: SHIPPED (2026-08-26) — post-sync/`focus=sync-feed` opens metrics feed; body-safe filter; `syncFeedAfter` vitest
  - Depends: N45-SYNC-FEED
  - Files: metrics / connect-email, `syncFeedAfter.ts`
  - Acceptance: After sync success, feed visible; no raw body
  - Est: S

- [x] **W075-FIX-PARSE-INLINE** · P0 · [Ingest] Fix-parse inline on activity row
  - Why: wrong totals destroy trust
  - Status: SHIPPED (2026-08-26) — inline merchant/total edit on activity row; API `ingestion.document.corrected` audit; `fixParseInline` vitest
  - Depends: N46-FIX-PARSE
  - Files: metrics Fix UI, `fixParseInline.ts`
  - Acceptance: Inline edit total/merchant; audit event
  - Est: S

- [x] **W076-HEALTH-RECONNECT** · P0 · [Ingest] Account health reconnect one-tap
  - Why: AUTH_FAILED must recover
  - Status: SHIPPED (2026-08-26) — Reconnect CTA on metrics/consent/connect-email; starts Gmail OAuth; `healthReconnect` vitest
  - Depends: N49-ACCT-HEALTH
  - Files: metrics / consent, `healthReconnect.ts`
  - Acceptance: Reconnect starts OAuth; status updates
  - Est: S

- [x] **W077-EXPORT-PROGRESS** · P0 · [Trust] Export progress UI
  - Why: large vault export usable
  - Status: SHIPPED (2026-08-26) — indeterminate prepare → share; ready copy; error retry in VaultPrivacyActions; `exportProgress` vitest
  - Depends: TRUST-EXPORT-UI
  - Files: VaultPrivacyActions, `exportProgress.ts`
  - Acceptance: Progress/ indeterminate; share when ready; error retry
  - Est: S

- [x] **W078-DELETE-CONFIRM-POLISH** · P0 · [Trust] Delete typed-confirm polish
  - Why: hard-delete must be hard to accident
  - Status: SHIPPED (2026-08-26) — typed DELETE/email modal; cannot dismiss mid-flight; logout after delete
  - Depends: TRUST-EXPORT-UI
  - Files: delete vault UI
  - Acceptance: Type DELETE/email; then logout; cannot dismiss mid-flight
  - Est: S

- [x] **W079-RETENTION-HUMAN-COPY** · P0 · [Trust] Retention schedule human copy
  - Why: EMAIL 7d / SMS 14d / RECEIPT 30d understandable
  - Status: SHIPPED (2026-08-26) — plain-language schedule on Consent + VaultPrivacyActions
  - Depends: TRUST-RETENTION
  - Files: consent / privacy
  - Acceptance: Shows schedule in plain language
  - Est: S

- [x] **W080-LIMITED-USE-NEAR-GMAIL** · P0 · [Trust] Limited Use always adjacent to Gmail CTA
  - Why: CASA / GTM trust
  - Status: SHIPPED (2026-08-26) — Limited Use block immediately above Connect Gmail; vitest adjacency
  - Depends: TRUST-CASA-TRACK
  - Files: connect-email, limitedUse
  - Acceptance: Limited Use visible before connect; vitest copy present
  - Est: S

- [x] **W081-PRIVACY-IN-APP** · P0 · [Trust] Privacy policy in-app reader
  - Why: DPDP/GDPR visible
  - Status: SHIPPED (2026-08-26) — `/(closet)/privacy` draft reader + Open on web; no store submit
  - Depends: TRUST-DPDP-GDPR docs
  - Files: consent / settings
  - Acceptance: Opens policy markdown/web; no store submit required
  - Est: S

- [x] **W082-QUIET-HOURS-EDITOR** · P0 · [Notif] Quiet-hours visual editor
  - Why: usable prefs
  - Status: SHIPPED (2026-08-26) — ±30m start/end pickers + next-send preview on Consent
  - Depends: W025
  - Files: notification prefs UI
  - Acceptance: Start/end pickers; preview next send
  - Est: S

---

# Cluster G · Play⇄Closet bridges (W083–W088) · P1 · Wave C

- [x] **W083-TRACK-BUY-SUCCESS** · P1 · [Bridge] Track Play buy success → Closet confirm
  - Why: sanctioned bridge delight
  - Status: SHIPPED (2026-08-26) — success sheet + vault/wardrobe CTAs; idempotent copy
  - Depends: N50-TRACK-PLAY-BUY
  - Files: `apps/mobile/app/order/[id].tsx`, `TrackBuySuccessSheet.tsx`, `bridgeWow.ts`
  - Acceptance: met — Success sheet with vault/wardrobe links; idempotent
  - Est: S

- [x] **W084-PREBUY-FIT-PANEL** · P1 · [Bridge] Pre-buy fit panel polish
  - Why: anti-impulse usable at checkout
  - Status: SHIPPED (2026-08-26) — overlap/gap/budget lines + soft note; Closet panel only
  - Depends: N33-PREBUY-FIT
  - Files: `apps/mobile/app/checkout.tsx`, `bridgeWow.ts` `prebuyFitPanelSections`
  - Acceptance: met — Overlap/gap/budget score readable; soft only
  - Est: S

- [x] **W085-BUDGET-NUDGE-COPY** · P1 · [Bridge] Budget nudge soft copy polish
  - Why: spend awareness without shame
  - Status: SHIPPED (2026-08-26) — soft API copy + footer; pay CTA never gated by nudge
  - Depends: WV08-PLAY-BUDGET-NUDGE
  - Files: `apps/api/src/lib/budget.ts`, `apps/mobile/app/checkout.tsx`, `BUDGET_NUDGE_SOFT_FOOTER`
  - Acceptance: met — Soft language; never blocks checkout
  - Est: S

- [x] **W086-REPLACE-TWIN-SHEET** · P1 · [Bridge] Replace-twin sheet from waste
  - Why: worn-out → affiliate without blended UI
  - Status: SHIPPED (2026-08-26) — sheet of twins; click → `cashback_events`
  - Depends: N51-REPLACE-TWIN
  - Files: `ReplaceTwinSheet.tsx`, disposition, `POST /waste/:id/replace-twins/click`
  - Acceptance: met — Sheet of twins; click → cashback_events
  - Est: S

- [x] **W087-WASTE-RESTYLE-CTA** · P1 · [Bridge] Waste → Play “see it restyled” CTA
  - Why: only sanctioned fantasy-serves-utility bridge
  - Status: SHIPPED (2026-08-26) — explicit CTA → Play feed; no blended screen
  - Depends: none
  - Files: disposition, `wasteRestyleCta` in `bridgeWow.ts`
  - Acceptance: met — Explicit CTA to Play try-on; no blended screen
  - Est: S

- [x] **W088-PAY-WITH-CREDIT-HINT** · P1 · [Bridge] Checkout “pay with store credit?” soft hint
  - Why: found money → spend path
  - Status: SHIPPED (2026-08-26) — merchant-matched vault hint; never auto-charge
  - Depends: vault credits
  - Files: `apps/mobile/app/checkout.tsx`, `matchStoreCreditHint`
  - Acceptance: met — Soft hint if matching merchant credit; never auto-charge
  - Est: S

---

# Cluster H · Growth / share / regional (W089–W094) · P1 · Wave C

- [x] **W089-REELS-BLUR-PRESET** · P1 · [Growth] Found-money Reels-safe blur preset
  - Why: shareable without PII
  - Status: SHIPPED (2026-08-26) — `blurPreset: "reels"` digit-blurs total, omits merchants, 9:16 aspect, worn.app watermark; vault Share → Reels
  - Depends: GROW-FOUND-SHARE
  - Files: `packages/shared/src/found-money.ts`, vault share
  - Acceptance: Extra blur preset; watermark worn.app
  - Est: S

- [x] **W090-NEVER-WORN-SHARE** · P1 · [Growth] Never-worn share polish
  - Why: waste aha shares
  - Status: SHIPPED (2026-08-26) — disposition uses `shareNeverWornCard`; blurred brands + watermark + Share.share
  - Depends: WV05-SHARE-CARD
  - Files: disposition share, `wasteMoney.ts`
  - Acceptance: Blurred brands; watermark; Share.share
  - Est: S

- [x] **W091-COPY-PACKS-IN-EN** · P1 · [Growth] IN Hinglish + EN copy packs toggle
  - Why: dual-track GTM
  - Status: SHIPPED (2026-08-26) — EN/Hinglish packs; onboarding Language chips; vault/today empty + titles switch
  - Depends: W003
  - Files: `packages/shared/src/copy-packs.ts`, closetPrefs, onboarding, vault, today
  - Acceptance: Toggle locale pack; vault/today strings switch
  - Est: M

- [x] **W092-REGION-PACK-ONBOARD** · P1 · [Fit] Region pack picker on Closet onboarding
  - Why: regional not India-only
  - Status: SHIPPED (2026-08-26) — IN/US/UK/GLOBAL chips on onboarding; Fit Vault loads preferred region templates
  - Depends: WV06-REGION-PACKS
  - Files: `region-pack-picker.ts`, onboarding, fit.tsx, closetPrefs
  - Acceptance: IN/US/UK/GLOBAL pick seeds templates
  - Est: S

- [x] **W093-WA-STATUS-ASSET** · P1 · [Growth] WhatsApp Status asset generator
  - Why: India $0 growth
  - Status: SHIPPED (2026-08-26) — 1080×1920 SVG + shareText; Reels blur; no merchants/digits; vault → WA Status
  - Depends: W023
  - Files: `packages/shared/src/wa-status-asset.ts`, foundMoney helpers
  - Acceptance: 9:16 safe image; no PII
  - Est: M

- [x] **W094-REFERRAL-LANDING-COPY** · P1 · [Growth] Referral deep-link landing microcopy
  - Why: worn.app/r/{code} usable
  - Status: SHIPPED (2026-08-26) — GET /r/:code + attribute return `landing`; family-share lander shows found-money + install CTA
  - Depends: N36
  - Files: `referral-landing.ts`, referral schema/routes, family-share.tsx
  - Acceptance: met — Explains found-money; install CTA; Closet ethos
  - Est: S

---

# Cluster I · Reliability & polish (W095–W100) · P0 · Wave C

- [x] **W095-COLD-START-CLOSET** · P0 · [Perf] Cold start Closet path &lt;2s target
  - Why: usable reopen
  - Status: SHIPPED (2026-08-26) — TTI mark/log (`closet_cold_start_tti`); defer secondary Today fetches via InteractionManager
  - Depends: none
  - Files: `closetColdStart.ts`, Today entry + deferred wardrobe/packages/capsule/rewear hooks
  - Acceptance: met — Measure/log TTI; defer non-critical fetches; vitest budget + defer gate
  - Est: M

- [x] **W096-PTR-EVERYWHERE** · P0 · [UX] Pull-to-refresh consistency on all Closet tabs
  - Why: usable refresh mental model
  - Status: SHIPPED (2026-08-26) — PTR on today/metrics/disposition (+ existing vault/wardrobe/accountant/consent)
  - Depends: UX-SKELETONS-OFFLINE
  - Files: today, metrics RefreshControl, disposition ClosetScreen onRefresh
  - Acceptance: met — PTR on metrics/consent/disposition too
  - Est: S

- [x] **W097-OFFLINE-BANNER-ACTIONS** · P0 · [UX] Offline banner retry / queued actions
  - Why: usable offline
  - Status: SHIPPED (2026-08-26) — Retry CTA + queued count; vault queue peek + flush retry
  - Depends: UX-SKELETONS-OFFLINE
  - Files: `ClosetScreen`, `offlineBanner.ts`, vault offline props
  - Acceptance: met — Retry CTA; shows queued count if any; vitest copy + screen
  - Est: S

- [x] **W098-VIRTUALIZE-REMAINING** · P0 · [UX] Virtualize remaining long lists
  - Why: low-end Android usable
  - Status: SHIPPED (2026-08-26) — ClosetVirtualList on disposition listings, packages RTO/transit/exchange, metrics activity
  - Depends: UX-PERF-LISTS
  - Files: disposition, PackagesPanel, metrics; listVirtualization checklist
  - Acceptance: met — FlatList when &gt;50; cached thumbs (CachedClosetImage elsewhere)
  - Est: S

- [x] **W099-A11Y-VAULT-TOTALS** · P0 · [a11y] Labels on vault totals and countdown
  - Why: usable + store a11y
  - Status: SHIPPED (2026-08-26) — vaultTotalA11yLabel + expiry countdown amount/currency/expiry
  - Depends: none
  - Files: `vaultA11y.ts`, FoundMoneyCountUp, ExpiryCountdownHero
  - Acceptance: met — accessibilityLabel includes amount + currency + expiry; vitest
  - Est: S

- [x] **W100-SENTRY-CLOSET-SMOKE** · P0 · [Obs] Closet Sentry smoke + triage note
  - Why: crash-free gate for soft launch
  - Status: SHIPPED (2026-08-26) — EXPO_PUBLIC_SENTRY_SMOKE path in docs/EAS.md; Closet tags + vitest smoke
  - Depends: OBS-SENTRY-CLOSET
  - Files: `apps/mobile/src/lib/sentry.ts`, `docs/EAS.md` Closet Sentry smoke section
  - Acceptance: met — `EXPO_PUBLIC_SENTRY_SMOKE` documented; Closet tags present; sentry.test.ts green
  - Est: S

---

## Queue reminder

- **Wave A first (W001–W030 + W073–W082 trust slice as capacity):** ≥10 parallel agents; standing QA continuous.
- Mark `[x]` only after verify. Prefer polish + tests over new tables.
- Do not fork unfinished `UNIVERSE_DETAILED_TODO` monetization/legal tickets into this file — keep those there.
