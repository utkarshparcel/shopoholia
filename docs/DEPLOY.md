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

- **`/privacy` doesn't exist yet.** The app links to it, Google sign-in's consent screen and both
  stores require a privacy policy URL. A draft is in `docs/legal/PRIVACY_POLICY_DRAFT.md`; it needs
  your sign-off before it's published.
- **Share links aren't served yet.** The app builds links like `/r/<code>` (referrals),
  `/c/<code>`, `/h/<code>`, `/p/outfit/<id>` and `/p/return/<id>`, and the site has no pages for
  them. They only matter once people can install the app.

## Phase 2: the backend and the apps

### What runs

| Process | Command | Notes |
|---|---|---|
| API | `pnpm --filter @worn/api build && pnpm --filter @worn/api start` | **One instance only**: order delivery timers run inside this process (they resume after a restart). |
| API worker | `pnpm --filter @worn/api start:worker` | Privacy erase/export, store-purchase reconciliation, cooling-off and Closet jobs, via Redis (BullMQ). |
| Closet workers | `services/worker-*` (`pnpm --filter <name> start`) | Only needed when Closet is on in the app (`EXPO_PUBLIC_FEATURE_CLOSET=1`). |
| Postgres 16 | managed | Run `pnpm --filter @worn/db db:migrate` with `DATABASE_URL` before each API release. |
| Redis 7 | managed | `maxmemory-policy noeviction` (BullMQ requires it). |
| Cloudflare R2 | bucket + custom domain `media.worncloset.app` | Catalog images, avatars, renders. |

Railway, Render or Fly.io can host the API, the worker, Postgres and Redis in one project.

### Migrations to run on first deploy

All of `packages/db/migrations` apply in order on an empty database (tested 0000 → 0020 on
Postgres 16). On an existing database, the newest ones also repair data:

- `0016_emi_due_day`: EMI plans get a due day, taken from their next due date.
- `0017_tailoring_review_per_order`: one review per tailoring order; later duplicates keep their
  text but lose the order link.
- `0018_reveal_rating`: reveal ratings move out of `orders.state_eta` into their own column.
- `0019_coin_ledger_render_types`: new coin-history types for paid renders and combines.
- `0020_render_combined_items`: a combined render's pieces get their own column, copied from the
  old `combined:` marker where present.

### API environment

The API refuses to start in production if any of these is missing:

| Variable | What for |
|---|---|
| `NODE_ENV=production` | |
| `DATABASE_URL` | Postgres. Without it everything would live in memory. |
| `JWT_ACCESS_SECRET` | Signs access tokens: a long random string. |
| `PRIVACY_HMAC_SECRET` | Keys consent/audit subject refs and poll share links: a random string of at least 16 characters. Never change it once set (old refs and links stop matching). |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Storage. |
| `OCR_PROVIDER_URL` | Receipt scanning. Google Cloud Vision works (`OCR_PROVIDER_FORMAT=google-vision`, key in `OCR_PROVIDER_API_KEY`); its free tier covers 1,000 images a month. |

Set these too (the API starts without them, but the feature answers 503 or refuses calls):

| Variable | Without it |
|---|---|
| `REDIS_URL` | Account deletion and data export answer 503, and the API worker can't start. |
| `GOOGLE_CLIENT_IDS` | Nobody can sign in: phone sign-in is off in production, so Google is the only way in. Web, iOS and Android client ids, comma-separated. |
| `FASHN_API_KEY` | Try-on and reveal renders are unavailable. |
| `TRUST_PROXY` | Defaults to `1` in production: one proxy hop (the host's load balancer) in front of the API, so rate limits key on the caller's address from `X-Forwarded-For`. Set the hop count your host uses, `true` behind a fully trusted network, or a comma-separated list of proxy addresses/CIDRs. Set `false` only if clients reach the API directly; otherwise every user shares the proxy's sign-in rate limit (20 a minute). |
| `WORN_ECONOMY_MODE` | Delivery timers. Production defaults to `prod`, the launch timers (Express 2 h, Standard 12 h, Slow burn 48 h); `beta` gives minutes (Express 2 min, Standard 5 min, Slow burn 8 min) and logs a warning. The boot log names the active mode. |
| `CATALOG_SEED_FILE` | Optional. The catalog file (JSON lines) an empty production catalog is filled from at boot; the bundled `dist/lib/seed/scraped-catalog.jsonl` is used otherwise. A catalog that has listings is never cleared or reseeded at boot. |
| `R2_PUBLIC_URL=https://media.worncloset.app` | Image links point nowhere. |
| `CORS_ORIGIN=https://worncloset.app` | (This is the default.) |
| `ADMIN_SECRET` | Admin routes are refused. |
| `CASHBACK_WEBHOOK_SECRET` | Affiliate cashback confirmations are refused. |
| `APPLE_BUNDLE_ID`, `ANDROID_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Coin purchases answer 503. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `OAUTH_TOKEN_SECRET`, `API_PUBLIC_URL` | Gmail connect (Closet) answers 503. Register `https://api.worncloset.app/ingestion/sources/oauth/callback` on the Google OAuth web client. |
| `SENTRY_DSN`, `POSTHOG_KEY` | No error reports or server analytics. |

The boot log lists every missing setting as an error or a warning.

The API worker (`start:worker`) reads the same settings as the API: give it the same environment,
`REDIS_URL` included (it refuses to start without Redis).

### The apps

Release builds (`apps/mobile/eas.json`: `preview`, `production`, `testflight`, `play-internal`)
already point at `https://api.worncloset.app`. Closet is off in all of them; Worn Play ships first,
matching the website. Build and submit steps are in the README ("Beta deploy") and
[`docs/EAS.md`](./EAS.md); they need `eas init` plus the Apple and Google developer accounts.

## Before each release

1. CI is green on the commit: lint, typecheck, website build, every test suite, migrations and the
   Postgres repository tests.
2. `pnpm --filter @worn/db db:migrate` against production (phase 2).
3. Deploy the API, then the worker, then the website.
4. Smoke test: sign in, check out a small haul, watch it reach the reveal, unlock one look; the
   coin balance in the profile matches the coin history.
