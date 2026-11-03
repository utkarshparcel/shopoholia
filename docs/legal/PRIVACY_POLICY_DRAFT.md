# WORN — Privacy Policy (DRAFT)

> **DRAFT. The owner (and counsel) must review and approve this text before it is published.**
> It is not legal advice and not executed legal terms. Everything in `[square brackets]` is a
> placeholder the owner fills in; nothing here invents company or legal details.
>
> Source path: `docs/legal/PRIVACY_POLICY_DRAFT.md` (the website renders `/privacy` from this file)  
> Compliance checklist: [`docs/TRUST_DPDP_GDPR.md`](../TRUST_DPDP_GDPR.md)  
> Pentest readiness (no fake report): [`docs/PENTEST_READINESS.md`](../PENTEST_READINESS.md)  
> Publish URL: `https://worncloset.app/privacy` (the app links it from the login screen and Profile)  
> Store listings: App Store Connect "Privacy Policy URL", Play Console "Privacy policy", Google OAuth
> consent screen. Play's account-deletion URL: `https://worncloset.app/privacy#delete-account`.

**Last updated (draft):** [DATE OF PUBLICATION]  
**Controller / Data Fiduciary:** [LEGAL ENTITY NAME], [REGISTERED ADDRESS]

## 1. Who we are

WORN is a fashion app. In **Worn Play** you sign in, make a try-on avatar from your own photo, fill
virtual hauls with pieces from partner stores, watch them "arrive" on a timer and see AI-generated
images of yourself wearing them. Coins pay for hauls and extras. **Worn Closet** (a separate part
of the app that is not yet available in every version) tracks gift cards, credits, returns and your
wardrobe; section 2.3 applies only if you use it.

Privacy contact: `privacy@worncloset.app`.

## 2. What we collect

### 2.1 Worn Play

| Category | What exactly | Why |
|----------|--------------|-----|
| Account | If you sign in with Google: your Google account id, email address and name. If you sign in with Apple: your Apple user id, the email Apple gives us (this may be a private relay address) and the name you choose to share the first time. An id we create for you, sign-in tokens. | Create and secure your account |
| Your photos (sensitive) | The photo(s) you upload to make your avatar, the avatar reference image we make from them, and the AI try-on images ("renders") of you wearing items you picked | The try-on features you ask for. We do **not** use them to train AI models, for ads, or for face recognition |
| App activity | Hauls and orders (items, delivery tier, times), reveals and ratings, your lookbook, style-quiz answers, daily streak, referral code and who invited you, cashback claims and partner-link clicks | Run the features; referral and cashback rewards |
| Coins and purchases | Coin balance and history. For coins you buy: the App Store / Google Play transaction id, product, time and whether it was a test purchase. **We never see your card or payment details**; Apple or Google handles the payment | Credit what you bought, prevent double credits and handle refunds |
| Device | Push notification token (if you allow notifications), time zone, app version | Notifications about your hauls; delivery times in your time zone |
| Analytics and diagnostics | Usage events (screens and actions, tied to your account id), crash and error reports | Fix problems and improve the app |

### 2.2 What we don't collect in Worn Play

No precise location, contacts, SMS, calendar, microphone or browsing history. No advertising
identifier; we don't track you across other companies' apps or sites, and we do **not** sell your
personal data.

### 2.3 Worn Closet (only if you use it)

| Category | Examples | Why |
|----------|----------|-----|
| Vault money | Gift-card / store-credit balances, merchants, expiry | Found-money features |
| Purchases / returns | Order summaries, return deadlines | Reminders |
| Receipts / warranties | Photos, OCR text, coverage dates | Claims & archive |
| Wardrobe / outfits | Item photos, wear log, preferences | Outfits & waste insights |
| Connected sources (optional, with consent) | Gmail read-only sync; SMS on Android; calendar event titles | Find receipts and plan outfits |

We do **not** use Gmail content for ads or to train general AI/ML models (Limited Use; see `docs/CASA.md`).

## 3. Legal bases (GDPR) / consent (DPDP)

- **Contract / service** — your account, try-on avatar and renders, hauls, coins and purchases.
- **Consent** — your photos for try-on (you choose to upload them and can delete them anytime),
  notifications, connected sources (Closet), non-essential analytics, marketing.
- **Legitimate interests** (counsel to confirm) — security, fraud prevention (for example, a
  purchase can't be credited to two accounts), product improvement with safeguards.

You may withdraw consent anytime: delete your photos (Profile → Delete my photos), turn off
notifications in your device settings, or delete your account.

## 4. How we use data

- Make your avatar and AI try-on images, and show your hauls, reveals and lookbook
- Credit coins you buy or earn, and give referral and cashback rewards
- Send notifications you allow (for example, "your haul is ready")
- Keep the service secure and working, and fix crashes
- Comply with law

## 5. Who we share it with

Only with service providers that run WORN for us, under contract, or when the law requires it:

| Provider | What they get | Why |
|----------|---------------|-----|
| FASHN.ai ([FASHN LEGAL NAME, COUNTRY]) | Your avatar reference image and the garment image | Generate the AI try-on images |
| Cloudflare (R2 storage) | Photos, avatar and render images | Store and serve images |
| [API AND DATABASE HOST, e.g. Railway / Render / Fly.io] | Account and app data | Run the API and database |
| Google | Sign-in with Google; Google Play billing for Android purchases | Sign-in, payments |
| Apple | Sign in with Apple; App Store payments for iPhone purchases | Sign-in, payments |
| Expo (push service), Apple Push Notification service, Firebase Cloud Messaging | Push token and notification text | Deliver notifications |
| PostHog ([REGION: US / EU cloud]) | Usage events with your account id | Product analytics |
| Sentry | Crash and error reports (we remove email addresses and long numbers where we can) | Reliability |
| [OCR PROVIDER, e.g. Google Cloud Vision] — Closet only | Receipt images | Read receipts |

Partner stores and affiliate networks: when you tap a partner link you go to the retailer's own
site, where their privacy policy applies; we see that you clicked and, for cashback, the purchase
confirmation the network sends us.

[OWNER: confirm whether image links are public-but-unguessable or signed, and describe it here
honestly.]

## 6. Retention

- Account and app data: until you delete your account.
- Photos: until you delete them (Profile → Delete my photos) or your account. When you upload a new
  avatar photo, the previous photos are deleted.
- After account deletion we keep only: a pseudonymous record that consents were given and
  withdrawn and that you asked for deletion (no user id, no contact details), and security audit
  entries in the same pseudonymous form. Apple and Google keep their own records of purchases you
  made with them. Items you listed as a seller that other users already bought stay visible to
  those users, without your name.
- Closet raw ingestion blobs are deleted after parsing: EMAIL **7d**, SMS **14d**, RECEIPT **30d**.
- Backups and provider logs: [OWNER: retention of database backups and log providers, e.g. "up to
  30 days"].

## 7. Your rights

Depending on where you live (India DPDP / EU-UK GDPR):

- Access / export your data ([OWNER: Worn Play export path — today the export is in Closet; until
  then, by email to `privacy@worncloset.app`])
- Correct your data (contact us)
- Withdraw consent (section 3)
- Delete your account (section 7.1)
- Lodge a complaint with a supervisory authority (EU/UK) or our grievance officer (India):
  [GRIEVANCE OFFICER NAME AND CONTACT]

### 7.1 Delete your account {#delete-account}

**In the app:** Profile → **Delete account** → confirm. This deletes your account and everything
in it straight away: profile, photos, avatar and try-on images, hauls and reveals, lookbook, coins
(including bought coins, which can't be refunded by us) and coin history, streaks and referrals.
You are signed out on every device. It can't be undone.

**Without the app:** email `privacy@worncloset.app` from the email address on your account (or
tell us your Apple relay address). We confirm it's you, delete the account within [30] days and
reply when it's done.

## 8. Security (summary)

Encryption in transit (HTTPS). Sign-in tokens expire and are revoked on sign-out and deletion.
OAuth tokens (Closet Gmail) are encrypted at rest (AES-GCM). Rate limits on sign-in and sensitive
routes. Threat model / pentest readiness: [`docs/PENTEST_READINESS.md`](../PENTEST_READINESS.md) —
**no fabricated third-party report** is claimed by this policy.

## 9. International transfers

Our providers may process data outside your country ([OWNER: list regions, e.g. US for FASHN.ai,
PostHog US cloud, Sentry]). For EU/UK data we will use appropriate safeguards (e.g. SCCs) as
approved by counsel.

## 10. Children

WORN is not directed at children. You must be at least [MINIMUM AGE — counsel: DPDP treats users
under 18 as children and requires verifiable parental consent] to use it. If you believe we
collected a child's data, contact us and we will delete it.

## 11. Changes

We will update this policy and revise the "Last updated" date. Material changes for EU/UK users may
require renewed notice or consent.

## 12. Contact

Privacy: `privacy@worncloset.app`  
Grievance officer / DPO (if appointed): [NAME AND CONTACT]  
[LEGAL ENTITY NAME AND REGISTERED ADDRESS]

---

*End of draft. Do not present this file as an executed policy or counsel-signed terms.*
