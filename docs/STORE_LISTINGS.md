# App Store + Play listings (REL-STORE-LISTINGS)

Paste-ready listing copy, App Privacy / Play Data Safety checklists, and a screenshot storyboard for **WORN Closet**. This doc does **not** submit to App Store Connect or Play Console — submit stays manual with founder credentials (`docs/EAS.md`).

> **GTM rule:** Screenshot #1 = found-money (₹ / $ vault total). Never lead with Gmail connect or Play try-on.

Related: [GTM ASO](GTM_ZERO_SPEND.md) · [CASA / Limited Use](CASA.md) · [EAS gates](EAS.md)

---

## Bundle / package IDs

| Platform | ID |
|----------|-----|
| iOS | `com.shopoholia.worn` |
| Android | `com.shopoholia.worn` |
| Display name | WORN |
| Primary surface for v1 listing | **Closet** (found money) — Play try-on is secondary / later creatives only |

---

## Positioning (store)

**EN one-liner:** Find forgotten gift cards, store credit, and return deadlines — money you already paid for.

**IN Hinglish (creatives / IN short desc):** Jo gift card / store credit / return window bhool gaye — WORN Closet dikhata hai kitna ₹ still baaki hai, expire hone se pehle.

**Anti-positioning (do not claim in listings):** bank · remittance · gift-card marketplace / sell-your-cards · budget app · “we read your inbox” without purpose + revoke.

---

## Google Play — listing copy

Limits: title ≤30 · short ≤80 · full ≤4000. Official: [Store listing](https://support.google.com/googleplay/android-developer/answer/9859152).

### EN (default / Global)

| Field | Copy |
|-------|------|
| **Title** (≤30) | `WORN Closet: Gift Card Tracker` |
| **Short** (≤80) | `Find unused store credit & return reminders before they expire.` |
| **Full** | See block below |

```
WORN Closet finds money you already paid for — unused gift cards, store credit, and return windows that are about to die.

Open the app, add a gift card or receipt in under a minute, and see how much you still have left. Optional email or SMS connect can surface more — you can skip and start manually.

What you get
• Gift card tracker & store credit wallet in one vault
• Return reminders with countdowns before the window closes
• Warranty / claim nudges for items you already bought
• Digital wardrobe helpers (today’s outfit) when you want them
• Export your data or delete your account anytime

Privacy first
• Read-only when you connect email — we don’t send mail or change settings
• No ads from your inbox or gift-card data
• You control connect, revoke, export, and hard-delete

WORN Closet is a consumer utility — not a bank, not a gift-card marketplace, not a budget app.

Keywords woven naturally: gift card tracker, store credit wallet, return reminder, digital wardrobe.
```

### EN-IN / Hinglish short (optional locale)

| Field | Copy |
|-------|------|
| **Title** | `WORN Closet: Gift Cards` |
| **Short** | `Bhooli gift cards, store credit & returns — expire se pehle dikhao.` |

### Category / contact

| Field | Value |
|-------|--------|
| App category | Tools or Lifestyle (prefer **Tools** for utility/found-money; avoid Finance if review risk) |
| Tags | gift cards, returns, wardrobe |
| Support email | Founder support inbox |
| Privacy policy URL | Public URL once published (draft: `docs/legal/PRIVACY_POLICY_DRAFT.md`; checklist: `docs/TRUST_DPDP_GDPR.md`; set `EXPO_PUBLIC_PRIVACY_URL`) |
| Account deletion | In-app Vault delete + public URL when required by Play |

---

## App Store — listing copy

Indexed: name ≤30 · subtitle ≤30 · keywords ≤100 (comma-separated, no spaces after commas). Official: [Product page](https://developer.apple.com/app-store/product-page/).

### EN (US)

| Field | Copy |
|-------|------|
| **Name** | `WORN Closet: Gift Cards` |
| **Subtitle** | `Store Credit & Returns` |
| **Keywords** (≤100) | `gift,card,tracker,store,credit,wallet,return,reminder,digital,wardrobe,unused,expiry,warranty,closet,refund` |
| **Promotional text** (optional, updatable) | `See how much forgotten credit you still have — before it expires.` |
| **Description** | Same narrative as Play full description (EN); lead with found-money aha. |

### EN (UK) — cross-localization leftovers

Use **different** keyword leftovers so US/UK indexes don’t collide. Example leftover set (swap after US ships):

`voucher,loyalty,points,expiry,deadline,wardrobe,outfit,receipt,sms,inbox,vault,claim,coupon`

Do **not** repeat name/subtitle words in keywords. Never put “app” in keywords. Never market auto-SMS read on iOS.

### What’s New (v1.0 template)

```
First Closet release: gift cards, store credit, and return countdowns in one vault. Manual entry first; optional email connect later. Export and delete anytime.
```

---

## Screenshot & preview plan (no assets required in repo)

Capture on a physical device or simulator after found-money onboarding (`/(closet)/onboarding` → vault). Blur emails, full card numbers, and PINs. Currency: ₹ for India creatives, $ for Global EN.

| Slot | Screen | Overlay / caption | Notes |
|------|--------|-------------------|-------|
| **1 (hero)** | Vault found-money total | `You have ₹2,400 in forgotten credit` / `$247 in forgotten credit` | ASO #1 — GTM non-negotiable |
| **2** | Returns countdown | `3 returns die this week` | Urgency |
| **3** | Consent / trust | `Read-only. Revoke anytime.` | Trust before Gmail marketing |
| **4** | Gift card / credit detail | Merchant + balance + expiry | Utility proof |
| **5** | Today outfit (optional) | `Today’s look from your closet` | Secondary; never slot 1 |
| **6** | Export / delete (optional) | `Your data. Export or delete.` | Review / policy alignment |

**Feature graphic (Play):** Big currency total + “forgotten credit” — same aha as screenshot #1.

**App preview video (optional):** ≤30s: open → add demo card → vault total → returns tab. No inbox dump.

**Copy bank:** “You have $247 in forgotten credit” · “3 returns die this week” · “Gift cards · store credit · wardrobe — $0”

---

## Play Data Safety checklist (must match product)

Fill Play Console **Data safety** to match this table. If product changes, update **this doc first**, then Console. Official: [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469).

### Data collected / shared

| Data type | Collected? | Shared? | Purpose | Notes |
|-----------|------------|---------|---------|-------|
| Email address | Yes (account + optional Gmail) | No (except processors) | App functionality, account management | Gmail = `gmail.readonly` only; Limited Use — see `docs/CASA.md` |
| User IDs | Yes | No | App functionality | Auth subject |
| Purchase history / gift cards / store credit / returns | Yes | No | App functionality | User-entered or parsed into vault summaries |
| Photos (receipts, wardrobe, avatar refs) | Yes (user-uploaded) | No | App functionality | Stored under retention / user delete |
| SMS / call log (Android) | Optional SMS content for purchase alerts | No | App functionality | **Android only**; never claim on iOS |
| Calendar events | Optional titles for outfit planning | No | App functionality | Skip anytime; usage strings in `app.json` |
| Crash logs | Yes (if Sentry DSN set) | With crash processor | Analytics / stability | No money PINs |
| App interactions / funnel analytics | Yes (if analytics sink set) | With analytics processor | Analytics | PII scrubbed (`sanitizeAnalyticsProperties`) |
| Device / diagnostics | As required by OS / Expo | Per SDK | App functionality / analytics | Match PrivacyInfo / SDK manifests |

**Not collected for advertising / tracking:** no ad SDK personalization from inbox or vault. Declare **not used for advertising** for email/financial vault data.

### Security practices (Play form)

| Question | Answer |
|----------|--------|
| Data encrypted in transit? | **Yes** (HTTPS) |
| Users can request deletion? | **Yes** — in-app Vault hard-delete (`DELETE /vault`) + support path |
| Committed to Play Families? | **No** (unless positioning changes) |

### Account deletion (Play policy)

| Item | Status |
|------|--------|
| In-app path | Vault → export / delete (`TRUST-EXPORT-UI`) |
| Web URL (if accounts exist) | Publish same flow or support URL before production listing |
| SLA | See [data-deletion playbook](playbooks/data-deletion.md) |

---

## App Store privacy nutrition labels (must match product)

Declare in App Store Connect per [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/). Mirror Play table; use **App Functionality** (not Tracking) for email / gift-card / return data.

| Privacy type (examples) | Linked to user? | Used for tracking? | Purpose |
|-------------------------|-----------------|--------------------|---------|
| Contact Info — Email Address | Yes | No | App Functionality, Account |
| Purchases / Financial Info (store credit, gift cards as app data) | Yes | No | App Functionality |
| Photos / Videos (user-selected) | Yes | No | App Functionality |
| Product Interaction | Yes (if analytics on) | No | Analytics |
| Crash Data | Yes (if Sentry on) | No | App Functionality |
| Other User Content (wardrobe notes, etc.) | Yes | No | App Functionality |

**Required Reason APIs / PrivacyInfo.xcprivacy:** keep Expo privacy manifest in sync before iOS submit (`docs/EAS.md` + Expo privacy guides).

**Review notes (paste for App Review):**

```
WORN Closet is a personal utility for gift cards, store credit, and return deadlines.
Demo: complete Closet onboarding → vault shows found-money total without Gmail.
Optional Gmail uses gmail.readonly only (Limited Use). Not a bank or gift-card exchange.
Account deletion: Vault → Delete. Support: [founder email].
```

---

## Closed testing gate (Play personal accounts)

Personal Play developer accounts may require **closed testing** before production. Target **≥12 closed testers** who install and stay opted-in long enough for Play’s gate (commonly cited as **12 testers × 14 days** — confirm current Console requirement).

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Create Play **closed** track + email list / Google Group | Founder | ☐ |
| 2 | Recruit ≥12 testers (WA / Reddit / friends) — mix IN + EN if dual-track | GTM | ☐ |
| 3 | Each tester installs closed build, opens Closet, reaches non-zero vault or demo ₹/$ | GTM | ☐ |
| 4 | Log: name · platform · country · install date · D7 reopen | GTM | ☐ |
| 5 | Hold closed track until Console allows production (≥12 / policy days) | Founder | ☐ |
| 6 | Production listing paste from this doc; Data Safety matches table above | Founder | ☐ |

iOS: TestFlight internal → external after Beta App Review; no fixed “12×14” rule, but keep ≥12 warm testers for parity.

---

## Pre-submit checklist (manual — not CI)

- [ ] Listing copy matches privacy policy + this Data Safety / nutrition table
- [ ] Screenshot #1 is found-money; no full card numbers / raw inbox
- [ ] Support + privacy + deletion URLs live
- [ ] Crash-free gate green (`docs/EAS.md`)
- [ ] Gmail still optional under 100-user cap until CASA (`docs/CASA.md`)
- [ ] Play closed testers ≥12 (personal account) before production
- [ ] **No CI / agent store submit** — `eas submit` only with founder creds

## CI hooks (no store submit)

```bash
node scripts/check-store-listings.mjs
# or: pnpm check:store-listings
```

Validates that this doc covers listing copy, Data Safety, screenshot plan, closed-testing ≥12, and that CI does not store-submit. Does **not** call `eas submit` or Play/ASC APIs.
