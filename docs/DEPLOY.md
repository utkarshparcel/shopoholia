# Deploying Worn

Two phases. The website can go live now; the backend only has users once the app is in the stores,
which needs the Apple and Google developer accounts.

| Phase | What goes live | Needs |
|---|---|---|
| 1. Now | `worncloset.app`: Worn Play at `/`, Worn Closet at `/closet`, the waitlist form | A Next.js host, DNS, the waitlist Sheet, email forwarding |
| 2. With the app | `api.worncloset.app`, `media.worncloset.app`, the iPhone and Android apps | Postgres, Redis, R2, an OCR provider, Google sign-in, Apple and Google developer accounts |

## Phase 1: the website

`apps/web` is a static Next.js site (every page is prerendered; no server code, no middleware).

1. **Host.** Vercel is the simplest fit for Next.js: import the repo, set the root directory to
   `apps/web`, framework Next.js, install command `pnpm install --frozen-lockfile`, build command
   `pnpm build`. Cloudflare Pages works too but needs the Next.js adapter.
2. **Environment variables** (Production, and Preview if you want):
   - `NEXT_PUBLIC_WAITLIST_URL`: the Google Apps Script web app URL (set-up steps in
     [`apps/web/waitlist/README.md`](../apps/web/waitlist/README.md)). Without it the sign-up
     forms fall back to an email button.
   - `NEXT_PUBLIC_SITE_URL` only if the site is not served from `https://worncloset.app`.
3. **Domains.** Add `worncloset.app` and `www.worncloset.app` to the host and redirect `www` to the
   apex. Create the DNS records the host gives you.
4. **Email.** Forward `hello@` and `privacy@worncloset.app` to a real inbox (Cloudflare Email
   Routing if the DNS is on Cloudflare, otherwise ImprovMX). The site and the privacy policy use
   both addresses.
5. **Check after deploy:** `/`, `/closet`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`,
   `/closet/opengraph-image` all load; submit one email through each form and see the row in the
   Sheet; paste the URL into a chat app to see the share card.

### Known gaps on the website

- **`/privacy` needs your sign-off.** The app links to it (login screen and Profile), Google
  sign-in's consent screen and both stores require it, and Play's account-deletion URL is its
  `#delete-account` section. The draft in `docs/legal/PRIVACY_POLICY_DRAFT.md` describes Worn Play
  as it ships; fill in the `[placeholders]` (legal entity, address, grievance officer, minimum
  age, hosting provider, backup retention) and approve it before it's published.
- **Share links open the website, not the app.** The app builds links like `/r/<code>`
  (referrals), `/c/<code>`, `/h/<code>`, `/p/outfit/<id>` and `/p/return/<id>`. The app has no
  Universal Links / App Links (no associated domains, no `/.well-known` files needed): a link opens
  the site's landing page, which points to the stores, and a referral code is typed in the app
  (Profile → Refer & earn).

## Phase 2: the backend and the apps

### What runs

| Process | Command | Notes |
|---|---|---|
| API | `pnpm --filter @worn/api build && pnpm --filter @worn/api start` | **One instance only**: order delivery timers run inside this process (they resume after a restart). |
| API worker | `pnpm --filter @worn/api start:worker` | **Run it at launch.** Retries of account deletion (stored objects left after a storage error), data exports, Google Play purchase reconciliation, cooling-off and Closet jobs, via Redis (BullMQ). |
| Closet workers | `services/worker-*` (`pnpm --filter <name> start`) | Only needed when Closet is on in the app (`EXPO_PUBLIC_FEATURE_CLOSET=1`). |
| Postgres 16 | managed | Run `pnpm --filter @worn/db db:migrate` with `DATABASE_URL` before each API release. |
| Redis 7 | managed | `maxmemory-policy noeviction` (BullMQ requires it). |
| Cloudflare R2 | bucket + custom domain `media.worncloset.app` | Catalog images, avatars, renders. |

Railway, Render or Fly.io can host the API, the worker, Postgres and Redis in one project.

### Migrations to run on first deploy

All of `packages/db/migrations` apply in order on an empty database (tested 0000 → 0021 on
Postgres 16). On an existing database, the newest ones also repair data:

- `0016_emi_due_day`: EMI plans get a due day, taken from their next due date.
- `0017_tailoring_review_per_order`: one review per tailoring order; later duplicates keep their
  text but lose the order link.
- `0018_reveal_rating`: reveal ratings move out of `orders.state_eta` into their own column.
- `0019_coin_ledger_render_types`: new coin-history types for paid renders and combines.
- `0020_render_combined_items`: a combined render's pieces get their own column, copied from the
  old `combined:` marker where present.
- `0021_users_apple_sub`: users get `apple_sub` (Sign in with Apple).

### API environment

The API refuses to start in production if any of these is missing:

| Variable | What for |
|---|---|
| `NODE_ENV=production` | |
| `DATABASE_URL` | Postgres. Without it everything would live in memory. |
| `JWT_ACCESS_SECRET` | Signs access tokens: a long random string. |
| `PRIVACY_HMAC_SECRET` | Keys the pseudonymous ids kept after account deletion: a random string of at least 16 characters, never changed afterwards. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Storage. |
| `OCR_PROVIDER_URL` | Receipt scanning. Google Cloud Vision works (`OCR_PROVIDER_FORMAT=google-vision`, key in `OCR_PROVIDER_API_KEY`); its free tier covers 1,000 images a month. |

Required for the app to pass store review. The API starts without them, but sign-in, purchases or
renders fail, and the boot log warns:

| Variable | Without it |
|---|---|
| `GOOGLE_CLIENT_IDS` | Google sign-in answers 503. Web, iOS and Android client ids, comma-separated (the same ids the EAS build uses, `docs/EAS.md`). Phone sign-in is off in production, so this and Apple are the only ways in. |
| `APPLE_BUNDLE_ID=com.shopoholia.worn` | Sign in with Apple and App Store purchases answer 503. (`APPLE_SIGN_IN_AUDIENCES` overrides the Sign in with Apple audience, comma-separated, if it ever differs.) |
| `ANDROID_PACKAGE_NAME=com.shopoholia.worn`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Play purchases answer 503. |
| `FASHN_API_KEY` | Try-on and reveal renders fail, so orders never reach their reveal. |
| `REDIS_URL` + the API worker running | See "Account deletion" below: deletion itself works, but the retries for leftover stored objects, data exports and Play purchase reconciliation never run, and routes that enqueue a job answer 503. Redis with `maxmemory-policy noeviction`. |
| `R2_PUBLIC_URL=https://media.worncloset.app` | Image links point nowhere. |

Set these too:

| Variable | Without it |
|---|---|
| `CORS_ORIGIN=https://worncloset.app` | (This is the default.) |
| `ADMIN_SECRET` | Admin routes are refused. |
| `CASHBACK_WEBHOOK_SECRET` | Affiliate cashback confirmations are refused. |
| `APPLE_BUNDLE_ID`, `ANDROID_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Coin purchases answer 503. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `OAUTH_TOKEN_SECRET`, `API_PUBLIC_URL` | Gmail connect (Closet) answers 503. Register `https://api.worncloset.app/ingestion/sources/oauth/callback` on the Google OAuth web client. |
| `SENTRY_DSN`, `POSTHOG_KEY` | No error reports or server analytics. |
| `IAP_ACCEPT_TEST_PURCHASES` | Leave unset. App Review and TestFlight buy with sandbox accounts against the production API, and Play license testers make test purchases; they are credited and recorded as `sandbox` (purchase row and the `iap_purchase` event). `0` refuses them, which fails App Review. |

The boot log lists every missing setting as an error or a warning.

### Account deletion

Both stores require in-app account deletion. Worn Play: Profile → Delete account, which calls
`DELETE /vault`. The API erases the account **before it answers** (every user row, refresh tokens,
the user's stored photos, avatar, renders and uploads), so it works with or without Redis and the
worker. What can be left is a stored object whose delete failed (R2 error): the account is already
gone, the request stays `RUNNING` with the keys in `privacy_requests.storage_keys`, and the API
worker's `privacy-erase` job retries them. Without the worker, delete those keys by hand
(`docs/playbooks/data-deletion.md`). Only when the database itself fails before anything is deleted
and no retry can be queued does the app get a 503 and keep the user signed in to try again.

### The apps

Release builds (`apps/mobile/eas.json`: `preview`, `production`, `testflight`, `play-internal`)
already point at `https://api.worncloset.app`. Closet is off in all of them; Worn Play ships first,
matching the website. Build and submit steps are in the README ("Beta deploy") and
[`docs/EAS.md`](./EAS.md); they need `eas init`, the Apple and Google developer accounts, and the
Google client ids in the EAS environment (a release build without them fails). The owner
checklist for both stores (products, OAuth clients, signing SHA-1s, notifications) is at the end
of `docs/EAS.md`; the listing, review notes and privacy answers are in
[`docs/STORE_LISTINGS.md`](./STORE_LISTINGS.md).

## Before each release

1. CI is green on the commit: lint, typecheck, website build, every test suite, migrations and the
   Postgres repository tests.
2. `pnpm --filter @worn/db db:migrate` against production (phase 2).
3. Deploy the API, then the worker, then the website.
4. Smoke test: sign in (Apple and Google), check out a small haul, watch it reach the reveal,
   unlock one look, buy the smallest coin pack with a sandbox / license-tester account; the coin
   balance in the profile matches the coin history. Delete a test account and check it can't sign
   back in to the old data.
