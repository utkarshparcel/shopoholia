# EAS Build, OTA & Release Gates — WORN Mobile (Expo SDK 56)

`apps/mobile/eas.json` defines build profiles per Expo EAS Build docs (v56). **CI never submits to the App Store or Play Store** — submit stays manual with Apple/Google credentials.

| Profile | `distribution` | Build number | OTA `channel` | Use |
|---------|----------------|--------------|---------------|-----|
| `development` | `internal` + `developmentClient:true` | — | — | Local dev client (simulator + device). |
| `preview` | `internal` | — | `preview` | Shareable APK / iOS ad-hoc for closed testing. |
| `production` | `store` | `autoIncrement` | `production` | App Store / Play production builds. |
| `testflight` | `store` (extends preview) | `autoIncrement` | `beta` | iOS build for TestFlight. |
| `play-internal` | `store` (extends preview, AAB) | `autoIncrement` | `beta` | Android build for the Play internal / closed track. |

`cli.appVersionSource` is `remote`: EAS keeps the build number (iOS `CFBundleVersion`, Android
`versionCode`) and every store profile bumps it, so each upload is accepted. The marketing version
is `expo.version` in `app.json` (1.0.0); bump it for each store release.

Every release profile sets `WORN_RELEASE_BUILD=1` and `EXPO_PUBLIC_API_URL=https://api.worncloset.app`;
`development` leaves it unset and falls back to `http://localhost:3000`. Closet is off in all of
them (`EXPO_PUBLIC_FEATURE_CLOSET` unset). `app.config.js` refuses a release build when:

- the API URL is missing, not https, or a local/private/tunnel host, or (production profile) not
  exactly `https://api.worncloset.app`;
- the Google client id of the platform being built is missing or malformed
  (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` for iOS, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` for Android);
  without it the login has no way in.

It warns (build continues) when `EXPO_PUBLIC_SENTRY_DSN` or `EXPO_PUBLIC_POSTHOG_KEY` is missing.

With Closet off, the Android manifest blocks the calendar, camera, SMS, microphone and
draw-over-apps permissions, and the iOS purpose strings describe Worn Play (one photo for the
avatar). The iOS app declares no non-exempt encryption, ships a privacy manifest for the
required-reason APIs, and has the Sign in with Apple entitlement.

## EAS environment variables (set once per environment)

`eas.json` uses EAS environments: `production` for `production`, `preview` for `preview`,
`testflight` and `play-internal`. Set these in the Expo dashboard (Project → Environment variables)
for **both** environments, visibility "Plain text" or "Sensitive" (EXPO_PUBLIC_ values end up in
the app, so they are not secrets):

| Variable | Value | Needed for |
|----------|-------|------------|
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS OAuth client id (`….apps.googleusercontent.com`), bundle id `com.worncloset.app` | iOS builds (required) |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Android OAuth client id, package `com.worncloset.app`, **SHA-1 of the EAS signing key and of the Play app-signing key** | Android builds (required) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Web OAuth client id | Web / Expo Go only (optional) |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry project DSN | Crash reports (warned when missing) |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry source-map upload | Only when the DSN is set; without the token the Sentry build step can fail |
| `EXPO_PUBLIC_POSTHOG_KEY` (+ `EXPO_PUBLIC_POSTHOG_HOST` for EU) | PostHog project key | Analytics (warned when missing) |

All three Google client ids also go into the API's `GOOGLE_CLIENT_IDS` (comma-separated).

Google sign-in on Android uses the redirect `com.worncloset.app:/oauthredirect` (the package is
registered as a URL scheme). Google disables custom URI schemes for new Android OAuth clients: in
Google Cloud Console → Credentials → the Android client → Advanced settings, **enable "Custom URI
scheme"**, or sign-in fails with `invalid_request`. (Longer term, Google recommends the Credential
Manager; switching needs a native Google sign-in library.)

## Preview build (closed testing / GTM)

```bash
cd apps/mobile
eas login                    # or EXPO_TOKEN=...
eas build --profile preview --platform all
# Android → internal APK; iOS → ad-hoc / internal distribution
```

Share the build URL from the EAS dashboard with closed testers.

## Production + store submit (manual — not CI)

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit --profile testflight --platform ios      # uses submit.testflight (APPLE_ID, ASC_APP_ID, APPLE_TEAM_ID)
eas submit --profile play-internal --platform android
```

The first Android upload must be done by hand in Play Console (the Play API refuses an app with no
uploaded build); `eas submit` works from the second one.

## OTA strategy (EAS Update)

**Not set up yet:** `expo-updates` is not installed, so release builds can't receive OTA updates
and every fix ships as a new build. `app.json` already has `runtimeVersion.policy: "appVersion"`
and `eas.json` assigns channels, so enabling OTA is: `npx expo install expo-updates`,
`eas update:configure`, a new build, then:

```bash
# Publish JS bundle to a channel (requires matching runtimeVersion)
eas update --channel preview --message "fix: …"
eas update --channel production --message "fix: …"
```

| Channel | Who | When to publish |
|---------|-----|-----------------|
| `preview` | Internal / closed testers on preview binaries | JS-only fixes during closed testing |
| `beta` | TestFlight / Play internal track binaries | Staged pre-prod hotfixes |
| `production` | Store / production binaries | After crash-free gate passes |

Rules:

1. **Native changes** (permissions, native modules, Expo SDK bump) → new EAS **build**, not OTA.
2. **JS/TS/assets only** → OTA to the channel that matches the installed binary.
3. Never ship OTA to `production` until the crash-free gate below is green on the current binary cohort.

## Staged rollout notes

1. **Preview cohort** — build `preview`, 5–20 closed testers; watch Sentry for 48h.
2. **Beta track** — `testflight` / `play-internal` builds; Play staged rollout 10% → 50% → 100%; TestFlight external only after internal soak.
3. **Production** — store submit only after the crash-free gate; prefer phased release on both stores.

## Crash-free ≥99.5% gate checklist

Use Sentry (Worn Play events; Closet events carry `worn_surface=closet` and don't occur while Closet is off) before promoting preview → beta → production:

- [ ] Crash-free sessions **≥ 99.5%** over the last **7 days** (or ≥48h for tiny cohorts) for the target release.
- [ ] No unresolved **P0** issues (sign-in, coins and purchases, checkout, reveal, account deletion).
- [ ] Smoke on a physical device: sign in (Apple on iOS, Google on both), make an avatar, check out a haul, open the reveal, buy the smallest coin pack with a sandbox / license-tester account, delete the account.
- [ ] Analytics arriving in PostHog (`iap_purchase`, checkout and reveal events).

Smoke event: set **`EXPO_PUBLIC_SENTRY_SMOKE=1`** once on a preview build to emit a test event; unset it before production.

**Kill / hold:** crash-free < 99.5%, or any coin-balance / purchase / deletion regression → stop the staged rollout.

## CI hooks (no store submit)

```bash
node scripts/check-eas-gates.mjs
```

GitHub Actions runs this on every PR/push. It validates the profiles, OTA channels, this doc's
coverage and `runtimeVersion`. It does **not** call `eas build` or `eas submit` (needs Apple/Google
creds — never in CI). `apps/mobile/scripts/app-config.test.mjs` (in the mobile test suite) checks
the release guards, permissions and that every store profile auto-increments.

## Submit credentials

Set in your shell **or** as EAS secrets before a **manual** submit. No credentials are committed.

| Var | Where | Notes |
|-----|-------|-------|
| `EXPO_TOKEN` | CI / local | `eas login` alternative for headless builds. |
| `APPLE_ID` | `submit.testflight.ios.appleId` | Apple ID email. |
| `ASC_APP_ID` | `submit.testflight.ios.ascAppId` | App Store Connect → App Information → Apple ID (numeric). |
| `APPLE_TEAM_ID` | `submit.testflight.ios.appleTeamId` | Membership details → Team ID (e.g. `AB12CD34EF`). |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | `submit.play-internal.android.serviceAccountKeyPath` | Path to the Play service-account JSON; `track: internal`. |

## Owner checklist (accounts and store setup)

Apple (developer account, App Store Connect):

1. The bundle id and Android package are `com.worncloset.app`. Register exactly that (it can't
   change after the first upload). If it ever has to change before then: `apps/mobile/app.json` (`ios.bundleIdentifier`,
   `android.package`, the second `scheme` entry), the API's `APPLE_BUNDLE_ID` /
   `ANDROID_PACKAGE_NAME`, the Google OAuth clients and `docs/STORE_LISTINGS.md`.
2. `eas init` in `apps/mobile` (adds `extra.eas.projectId`), then `eas credentials` / the first
   `eas build` registers the App ID with the **Sign in with Apple** and **Push Notifications**
   capabilities and creates the certificates and the APNs key (EAS uploads it for Expo push).
3. App Store Connect: create the app; In-App Purchases → four **Consumable** products
   `worn.coins.100`, `worn.coins.350`, `worn.coins.650`, `worn.coins.1500` with prices, names and a
   review screenshot; agreements, tax and banking (Paid Apps agreement) must be active for IAP.
4. App Store Server Notifications V2: Production and Sandbox URL
   `https://api.worncloset.app/webhooks/app-store`.
5. App Privacy, age rating, review notes: from `docs/STORE_LISTINGS.md`.
6. Sandbox tester accounts (Users and Access → Sandbox) for your own purchase tests.
7. Sign in with Apple key, so account deletion revokes the user's Apple tokens (App Review checks
   this). Apple Developer → Certificates, Identifiers & Profiles → **Keys** → **+**: name it (e.g.
   "Worn Sign in with Apple"), tick **Sign in with Apple**, **Configure** → primary App ID
   `com.worncloset.app`, save, **Continue**, **Register**, then **Download** the `.p8` file (only
   downloadable once; keep it in your password manager). Note the key's **Key ID** (10 characters,
   on the key page) and your **Team ID** (Membership details, top right of the developer site).
   Set on the API (`docs/DEPLOY.md`): `APPLE_SIGN_IN_KEY_ID` = Key ID, `APPLE_TEAM_ID` = Team ID,
   `APPLE_SIGN_IN_PRIVATE_KEY` = the `.p8` contents (with `-----BEGIN PRIVATE KEY-----`; newlines
   or literal `\n`), and `OAUTH_TOKEN_SECRET` if it isn't set yet. Restart the API and the worker;
   the boot log stops warning "Apple tokens are not revoked". Smoke test: sign in with Apple on a
   device, delete the account, and check Settings → Apple ID → Sign-In & Security → Sign in with
   Apple no longer lists Worn.

Google (Play Console, Google Cloud):

1. Create the app; Monetize → In-app products → the same four product ids (managed products).
2. Play app signing: copy the app-signing key **SHA-1** (for the Android OAuth client) from
   Setup → App signing; also the EAS upload key SHA-1 (`eas credentials`).
3. Google Cloud: OAuth consent screen (app name, privacy policy URL, `worncloset.app` as an
   authorized domain), and three OAuth clients: Web, iOS (bundle id), Android (package + SHA-1s,
   custom URI scheme enabled). Ids → the EAS variables above and the API's `GOOGLE_CLIENT_IDS`.
4. Service account with Play Console access ("View financial data" and "Manage orders and
   subscriptions") → the API's `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`; a second key (or the same) for
   `eas submit` (`GOOGLE_SERVICE_ACCOUNT_KEY_PATH`).
5. Real-time developer notifications (Pub/Sub) are optional: the API reconciles Play purchases
   with its worker.
6. Data safety, account deletion URL, age rating, app access instructions, closed testing with
   ≥12 testers and license testers: from `docs/STORE_LISTINGS.md`.
