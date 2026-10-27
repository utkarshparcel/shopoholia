# EAS Build, OTA & Release Gates — WORN Mobile (Expo SDK 56)

`apps/mobile/eas.json` defines build profiles per Expo EAS Build docs (v56). **CI never submits to the App Store or Play Store** — submit stays manual with Apple/Google credentials.

| Profile | `distribution` | OTA `channel` | Use |
|---------|----------------|---------------|-----|
| `development` | `internal` + `developmentClient:true` | — | Local dev client (simulator + device). |
| `preview` | `internal` | `preview` | Shareable APK / internal ad-hoc for closed testing. |
| `production` | `store` | `production` | Store-signed bundle for TestFlight / Play (autoIncrement). |
| `testflight` / `play-internal` | extends preview | `beta` | Convenience aliases used by `README.md`. |

`apps/mobile/app.json` sets `runtimeVersion.policy: "appVersion"` so EAS Update OTA binaries match the native app version.

## Preview build (closed testing / GTM)

```bash
cd apps/mobile
eas login                    # or EXPO_TOKEN=...
eas build --profile preview --platform all
# Android → internal APK; iOS → ad-hoc / internal distribution
```

Share the build URL from the EAS dashboard with closed testers. Prefer `preview` for WhatsApp/Reddit GTM cohorts before store tracks.

## Production + store submit (manual — not CI)

```bash
eas build --profile production --platform ios --auto-increment
eas build --profile production --platform android --auto-increment
eas submit --profile testflight --platform ios      # after a production/ios build
eas submit --profile play-internal --platform android
```

Bundle identifiers: `com.shopoholia.worn` (iOS + Android). Bump `expo.version` or rely on `cli.appVersionSource: remote`.

## OTA strategy (EAS Update)

Channels are wired in `eas.json` (`preview` → `preview`, `production` → `production`, beta aliases → `beta`).

| Channel | Who | When to publish |
|---------|-----|-----------------|
| `preview` | Internal / closed testers on preview binaries | JS-only fixes during closed testing |
| `beta` | TestFlight / Play internal track binaries | Staged pre-prod hotfixes |
| `production` | Store / production binaries | After crash-free gate passes |

```bash
# Publish JS bundle to a channel (requires matching runtimeVersion)
eas update --channel preview --message "fix: vault offline banner"
eas update --channel production --message "fix: return countdown"
```

Rules:

1. **Native changes** (permissions, native modules, Expo SDK bump) → new EAS **build**, not OTA.
2. **JS/TS/assets only** → OTA to the channel that matches the installed binary.
3. Never ship OTA to `production` until the crash-free gate below is green on the current binary cohort.

## Staged rollout notes

1. **Preview cohort** — build `preview`, 5–20 closed testers; watch Sentry Closet tags for 48h.
2. **Beta track** — `testflight` / `play-internal` builds on channel `beta`; Play staged rollout 10% → 50% → 100% if available; TestFlight external only after internal soak.
3. **Production** — store submit only after crash-free gate; prefer phased release on Play; App Store phased release when available.
4. **OTA follow-ups** — ship JS fixes to the same channel as the binary; if crash rate regresses, halt OTA and roll back via EAS Update republish of last-good update group.

## Crash-free ≥99.5% gate checklist

Use Sentry (Closet surface tags from OBS-SENTRY-CLOSET) before promoting preview → beta → production or publishing production OTA:

- [ ] Crash-free sessions **≥ 99.5%** over the last **7 days** (or ≥48h for tiny cohorts) for the target release / channel.
- [ ] No unresolved **P0** Closet issues (auth, vault money, returns, ingestion consent).
- [ ] Smoke: cold start Closet today + vault found-money + accountant summary on a physical device.
- [ ] Analytics sink healthy (`accountant_viewed` / `found_money` funnel events arriving).
- [ ] OTA `runtimeVersion` matches the binary under test (`appVersion` policy).

### Closet Sentry smoke (W100)

Preview / QA triage path:

1. Set `EXPO_PUBLIC_SENTRY_DSN` (and optionally server `SENTRY_DSN`) in the preview env / EAS secrets.
2. Set **`EXPO_PUBLIC_SENTRY_SMOKE=1`** once on a preview build (or local) — app init emits `worn.smoke.closet` with tag `worn_surface=closet`.
3. Confirm the event in Sentry Issues / Discover filtered by `worn_surface:closet` (and `closet_screen` on screen errors).
4. Unset `EXPO_PUBLIC_SENTRY_SMOKE` before shipping production so smoke is not continuous noise.
5. Server/workers: `SENTRY_SMOKE=1` emits `worn.smoke.api` / `worn.smoke.worker.*` via `@worn/shared` `initNodeSentry`.

**Triage note:** Closet mobile crashes and `captureClosetException` events are tagged `worn_surface=closet`. Prefer filtering that tag for soft-launch crash-free gates; Play surface uses separate tags when present.

**Kill / hold:** crash-free &lt; 99.5%, or any money-number / consent regression → stop staged rollout and do not OTA production.

## CI hooks (no store submit)

```bash
node scripts/check-eas-gates.mjs
```

GitHub Actions runs this on every PR/push. It validates:

- `eas.json` has `development` / `preview` / `production` with required distribution + OTA channels
- `docs/EAS.md` covers preview, OTA, staged rollout, crash-free gate, and that CI does not store-submit
- `app.json` has `runtimeVersion` for EAS Update

It does **not** call `eas build` or `eas submit` (needs Apple/Google creds — never in CI).

## Required env / secrets

Set in your shell **or** `eas secret:create` before **manual** store submit.

| Var | Where | Notes |
|-----|-------|-------|
| `EXPO_TOKEN` | CI / local | `eas login` alternative for headless **builds** (optional; not required for gate script). |
| `APPLE_ID` | `submit.testflight.ios.appleId` | Apple ID email. |
| `ASC_APP_ID` | `submit.testflight.ios.ascAppId` | App Store Connect App Apple ID. |
| `APPLE_TEAM_ID` | `submit.testflight.ios.appleTeamId` | Team ID (e.g. `AB12CD34EF`). |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | `submit.play-internal.android.serviceAccountKeyPath` | Path to JSON key; `track: internal`. |

> No credentials are committed. See [Expo EAS docs](https://docs.expo.dev/versions/v56.0.0/build/introduction/) for `appVersionSource`, `autoIncrement`, and [EAS Update](https://docs.expo.dev/eas-update/introduction/).
