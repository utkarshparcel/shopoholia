# App Store + Play listings (REL-STORE-LISTINGS)

Paste-ready listing copy, App Review / Play review notes, App Privacy and Play Data Safety answers,
and a screenshot plan for **Worn Play**, the app every release profile builds (Closet is off:
`EXPO_PUBLIC_FEATURE_CLOSET` is unset in `apps/mobile/eas.json`). This doc does **not** submit to
App Store Connect or Play Console; submit stays manual with the owner's credentials
([`docs/EAS.md`](EAS.md)).

> Only describe what the build does. Gift cards, store credit, returns, warranties, Gmail / SMS /
> calendar connect and the wardrobe are **Worn Closet** features: they are not in this build and
> must not appear in the listing, screenshots or review notes until Closet ships.

Related: [Privacy policy draft](legal/PRIVACY_POLICY_DRAFT.md) · [EAS gates](EAS.md) ·
[Deploy](DEPLOY.md) · [GTM ASO](GTM_ZERO_SPEND.md)

---

## Bundle / package IDs

| Platform | ID |
|----------|-----|
| iOS bundle id | `com.worncloset.app` |
| Android package | `com.worncloset.app` |
| Display name | WORN |
| In-app products (consumable, both stores) | `worn.coins.100`, `worn.coins.350`, `worn.coins.650`, `worn.coins.1500` |

The ids still carry the old project name. They can be changed only **before the first upload**
(App Store Connect app record, Play Console app, Google OAuth clients); afterwards they are
permanent. Decide before creating the store records (see the owner checklist in
[`docs/EAS.md`](EAS.md)).

---

## Positioning (store)

**EN one-liner:** Try clothes on an AI avatar of you, build a haul, and watch it arrive.

**Anti-positioning (do not claim):** real deliveries of physical goods from WORN · cash prizes ·
coins worth money · "free clothes" · anything Closet does.

---

## Google Play — listing copy

Limits: title ≤30 · short ≤80 · full ≤4000. Official: [Store listing](https://support.google.com/googleplay/android-developer/answer/9859152).

| Field | Copy |
|-------|------|
| **Title** (≤30) | `WORN: AI Try-On Hauls` |
| **Short** (≤80) | `Try outfits on an AI avatar of you. Build a haul, then watch the reveal.` |
| **Full** | See block below |

```
WORN turns outfit browsing into a try-on show starring you.

Upload one photo and WORN makes your try-on avatar. Browse pieces from partner stores, add the ones you love to a haul, and pick how fast it "arrives": your haul moves through packed, shipped and out for delivery on a timer, then opens as a reveal with AI images of you wearing every piece.

What you can do
• Make a try-on avatar from your own photo
• Fill virtual hauls with pieces from partner stores
• Watch the delivery timeline and open your reveal
• Save looks to your lookbook
• Generate new scenes or combine pieces into full looks with coins
• Keep a daily streak and invite friends for bonus coins
• Buy any piece for real on the partner's site when you love it

Good to know
• Hauls are virtual: WORN doesn't ship anything. Partner links take you to the retailer, and WORN may earn a commission.
• Coins are an in-app currency for WORN only. New accounts get welcome coins; more are sold as in-app purchases. Coins have no cash value.
• Your photos are used only for your try-on images. Delete your photos or your whole account anytime from your profile.

Privacy policy: https://worncloset.app/privacy
```

### Category / contact

| Field | Value |
|-------|-------|
| App category | Lifestyle (alternative: Shopping) |
| Tags | Fashion, Virtual try-on |
| Email | `hello@worncloset.app` |
| Website | `https://worncloset.app` |
| Privacy policy | `https://worncloset.app/privacy` |
| Contains ads | No |
| In-app purchases | Yes (coin packs) |

---

## App Store — listing copy

Limits: name ≤30 · subtitle ≤30 · promotional text ≤170 · keywords ≤100 (comma-separated, no spaces needed).

| Field | Copy |
|-------|------|
| **Name** | `WORN: AI Try-On Hauls` |
| **Subtitle** | `See outfits on your avatar` |
| **Promotional text** | `Make your try-on avatar from one photo, build a haul from partner stores and watch it arrive as a reveal of you wearing every piece.` |
| **Keywords** | `try on,virtual,outfit,fashion,avatar,haul,style,lookbook,clothes,ai,wardrobe,reveal` |
| **Description** | Same as the Play full description above |
| **Category** | Lifestyle (secondary: Shopping) |
| **Support URL** | `https://worncloset.app` |
| **Marketing URL** | `https://worncloset.app` |
| **Privacy Policy URL** | `https://worncloset.app/privacy` |

### What's New (v1.0)

```
The first WORN: make your try-on avatar, build hauls, watch them arrive and open your reveal.
```

---

## Screenshot & preview plan (no assets required in repo)

Capture on a release build (preview profile) signed in with a test account that has a ready
avatar. Use your own photo or a model who agreed in writing; no real customer photos.

| Slot | Screen | Caption |
|------|--------|---------|
| Screenshot #1 | Reveal deck (`/reveal/[orderId]`) with try-on images | "See it on you" |
| #2 | Feed (`/(tabs)/feed`) | "Pick pieces from partner stores" |
| #3 | Checkout tiers (`/checkout`) | "Choose how fast it arrives" |
| #4 | Order tracker (`/order/[id]`) | "Watch your haul on its way" |
| #5 | Lookbook (`/(tabs)/lookbook`) | "Save the looks you love" |
| #6 | Avatar onboarding (`/(onboarding)/avatar`) | "One photo makes your avatar" |

Sizes: iPhone 6.9" (1320×2868) and 6.5" (1284×2778); iPad 13" (2064×2752) because
`supportsTablet` is on (or turn it off before submitting). Play: at least 2 phone screenshots
(1080×1920 or larger) plus a 1024×500 feature graphic.

---

## Review notes

### App Review (App Store Connect → App Review Information → Notes)

```
WORN is a virtual try-on app. Hauls are virtual: nothing is shipped.

Sign in: tap "Continue with Apple" (or "Continue with Google") on the first screen; there is no separate WORN password, so no demo account is needed. New accounts receive 500 welcome coins.

To try the main flow:
1. After sign-in, upload one photo of a person (the avatar screen); it takes about a minute to process.
2. Feed: open any piece and tap Add to haul, then the cart and Checkout. Choose a delivery tier and pay with coins (welcome coins are enough).
3. Profile shows the order. The delivery timeline runs on the server: [TIER TIMINGS, e.g. "Express: 2 hours"; set WORN_ECONOMY_MODE on the API and state the times here]. When it is ready, Profile shows "Reveal ready" with the AI try-on images.

In-app purchases: Profile → Get more coins (or the coin wallet). The four coin packs are consumables bought through the App Store; your sandbox account works (the server accepts and records sandbox purchases).

Account deletion: Profile → Delete account (bottom of the list). It deletes the account and its data immediately and signs out.
Privacy policy: Profile → Privacy policy, and on the login screen.

Photos: the photo is used only to make the user's avatar and their own try-on images (processed by our AI provider); users can delete their photos from Profile → Delete my photos.
```

Contact: [OWNER NAME, PHONE, EMAIL]. Sign-in required: **No demo account** (Sign in with Apple).

### Google Play (App content → App access)

Choose "All or some functionality is restricted" and add instructions: "Sign in with Google on the
first screen with any Google account; no separate credentials. New accounts get 500 welcome coins.
Coin packs are in Profile → Get more coins (license testers can buy without being charged).
Account deletion: Profile → Delete account."

---

## Play Data Safety (must match the code)

Derived from what Worn Play sends (apps/mobile with Closet off, apps/api). Re-check when a feature
changes.

### Data collected

| Play data type | Collected | Shared | Optional | Purpose | Notes |
|----------------|-----------|--------|----------|---------|-------|
| Personal info → Name | Yes | No | No | Account management | Google profile name; Apple name if shared |
| Personal info → Email address | Yes | No | No | Account management | Google email / Apple (relay) email |
| Personal info → User IDs | Yes | No | No | Account management, Analytics | Account id; Google / Apple account ids |
| Photos and videos → Photos | Yes | No* | Yes (needed for try-on) | App functionality | Avatar photo and AI renders (*processed by our AI service provider, which Play counts as a service provider, not "sharing") |
| Financial info → Purchase history | Yes | No | No | App functionality | Coin purchase records (store transaction id, product, time). No card data |
| App activity → App interactions | Yes | No | No | Analytics, App functionality | Hauls, reveals, lookbook, streaks, partner-link clicks; PostHog events |
| App activity → Other user-generated content | Yes | No | Yes | App functionality | Style-quiz answers, reveal ratings |
| App info and performance → Crash logs | Yes | No | No | Analytics | Sentry (when configured) |
| App info and performance → Diagnostics | Yes | No | No | Analytics | Error reports |
| Device or other IDs | Yes | No | Yes | App functionality | Expo push token (only if notifications are allowed) |

Not collected: location, contacts, messages, calendar, audio, files, browsing history, health,
financial account details, advertising id.

### Security practices (Play form)

| Question | Answer |
|----------|--------|
| Data encrypted in transit | Yes (HTTPS only; `NSAllowsArbitraryLoads` false, API URL must be https) |
| Users can request deletion | Yes: in the app (Profile → Delete account) and by email |
| Committed to Play Families policy | No (not directed at children) |
| Independent security review | No |

### Account deletion (Play policy)

- In app: Profile → **Delete account** (`DELETE /vault`; erases before answering).
- Web: `https://worncloset.app/privacy#delete-account` (the privacy policy's deletion section:
  in-app steps plus the `privacy@worncloset.app` email path). Enter this URL in Play Console → App
  content → Data safety → "Delete account URL".
- What is kept after deletion: pseudonymous consent/audit records (no user id or contact details);
  Apple/Google keep their own purchase records.

---

## App Store privacy nutrition labels (must match the code)

Tracking: **No** (no data used to track across other companies' apps; no ad SDKs; no IDFA, so no
App Tracking Transparency prompt).

| Data type | Linked to the user | Used for tracking | Purposes |
|-----------|--------------------|-------------------|----------|
| Contact info → Name | Yes | No | App functionality |
| Contact info → Email address | Yes | No | App functionality |
| User content → Photos or videos | Yes | No | App functionality |
| User content → Other user content | Yes | No | App functionality (quiz answers, ratings) |
| Identifiers → User ID | Yes | No | App functionality, Analytics |
| Identifiers → Device ID | Yes | No | App functionality (push token) |
| Purchases → Purchase history | Yes | No | App functionality |
| Usage data → Product interaction | Yes | No | Analytics |
| Diagnostics → Crash data | Yes | No | App functionality (Sentry) |
| Diagnostics → Other diagnostic data | Yes | No | App functionality |

---

## Age rating

Answers for the App Store questionnaire / Play IARC questionnaire, from what the app contains:

| Topic | Answer |
|-------|--------|
| Violence, sexual content, profanity, drugs, horror | None |
| Gambling / simulated gambling | **No.** Coins buy fixed items and actions at listed prices; no random rewards, loot boxes or prizes. (Re-check if a random reward is ever added: it would need odds disclosure.) |
| Contests | No |
| User-generated content shared with others | No (photos and renders are private to the user) |
| Unrestricted web access | No (partner links open the retailer's site in the browser) |
| In-app purchases | Yes |
| Users can interact / share location | No / No |
| Expected rating | 4+ (App Store), Everyone / PEGI 3 (Play), subject to the questionnaire |

Set the minimum age the privacy policy states (section 10) in the Play target audience form
(choose 18+ unless counsel says otherwise; DPDP treats under-18s as children).

---

## Closed testing gate (Play personal accounts)

New personal Play developer accounts must run a **closed test with ≥12 testers opted in for 14
days** before production access (confirm the current Console requirement).

| Step | Owner | Status |
|------|-------|--------|
| 1 | Create the Play **closed** track + tester email list / Google Group | Owner | ☐ |
| 2 | Recruit ≥12 testers | GTM | ☐ |
| 3 | Each tester installs the closed build, makes an avatar and opens one reveal | GTM | ☐ |
| 4 | Add testers' Google accounts as **license testers** so coin purchases don't charge them | Owner | ☐ |
| 5 | Hold the closed track until Console allows production | Owner | ☐ |

iOS: TestFlight internal, then external after Beta App Review. TestFlight purchases are sandbox
purchases and are credited (recorded as sandbox).

---

## Pre-submit checklist (manual — not CI)

- [ ] Listing, screenshots and review notes describe Worn Play only
- [ ] Privacy policy published at `https://worncloset.app/privacy` with the deletion section
- [ ] Coin packs created in App Store Connect and Play Console with the ids above, approved / active
- [ ] Data Safety and App Privacy answers entered from the tables above
- [ ] Age rating questionnaires answered
- [ ] Play closed testers ≥12 (personal account) before production
- [ ] Production API live with the settings in `docs/DEPLOY.md` (sign-in, purchases, worker)

---

## CI hooks (no store submit)

```bash
node scripts/check-store-listings.mjs
# or: pnpm check:store-listings
```

Validates that this doc covers listing copy, review notes, Data Safety, nutrition labels, the
screenshot plan, account deletion, closed testing ≥12, and that CI does not store-submit, and that
the store copy doesn't advertise Closet-only features. Does **not** call `eas submit` or Play/ASC
APIs.
