# Deploying Worn

Two phases. The website can go live now; the backend only has users once the app is in the stores,
which needs the Apple and Google developer accounts.

| Phase | What goes live | Needs |
|---|---|---|
| 1. Now | `worncloset.app`: Worn Play at `/`, Worn Closet at `/closet`, the early-access form | Cloudflare: Workers, DNS, Email Routing |
| 2. With the app | `api.worncloset.app`, `media.worncloset.app`, the iPhone and Android apps | Postgres, Redis, R2, an OCR provider, Google sign-in, Apple and Google developer accounts |

## Phase 1: the website

`apps/web` is a static Next.js site (every page is prerendered, no middleware) plus one small Worker,
`apps/web/worker/index.ts`, which answers the early-access form at `/api/join`.

1. **Host.** Cloudflare Workers with static assets. `apps/web/next.config.js` sets
   `output: 'export'`, so `next build` writes the whole site to `apps/web/out`, and
   `apps/web/wrangler.jsonc` uploads that folder plus the Worker as `worn-web`. The Worker only
   runs for `/api/*` (`run_worker_first`); everything else is served straight from the assets.
   Response headers live in `apps/web/public/_headers`. To ship by hand: `pnpm --filter @worn/web
   exec wrangler login` once per machine, then `pnpm --filter @worn/web run deploy` (runs
   `next build && wrangler deploy`). Pushes to `main` that touch `apps/web` deploy on their own
   through `.github/workflows/deploy-web.yml` once the repository has the `CLOUDFLARE_API_TOKEN`
   secret: in the Cloudflare dashboard, My Profile, API Tokens, create a token from the "Edit
   Cloudflare Workers" template scoped to this account, then add it on GitHub under Settings,
   Secrets and variables, Actions. Until then the workflow skips with a notice.
2. **Configuration.** `NEXT_PUBLIC_SITE_URL` is read at build time and only needed if the site is
   not served from `https://worncloset.app`. The inbox the form writes to is the Worker secret
   `JOIN_TO`, a verified Email Routing destination address of the account:
   `printf '%s' you@example.com | pnpm --filter @worn/web exec wrangler secret put JOIN_TO`.
   Secrets live on the Worker, not in the repository; `wrangler dev` reads the same name from
   `apps/web/.dev.vars` (git-ignored).
3. **Domains.** The Worker is always reachable at `https://worn-web.worn-web.workers.dev`.
   `worncloset.app` is a zone in the same Cloudflare account (Free plan, active since 2026-11-05).
   The domain stays registered at GoDaddy, which points at Cloudflare's nameservers
   `cody.ns.cloudflare.com` and `imani.ns.cloudflare.com` (GoDaddy: Domain, Nameservers, Change,
   "I'll use my own nameservers"). `wrangler.jsonc` binds the apex to the Worker as a custom domain
   (`routes`), a zone Redirect Rule (template "Redirect from WWW to root") sends `www` to the apex,
   and the zone setting "Always Use HTTPS" is on.
4. **Email.** Cloudflare Email Routing (free) is enabled on the zone and forwards `hello@` and
   `privacy@worncloset.app` to the account inbox; the MX, SPF and DKIM records it needs are in the
   zone. The site and the privacy policy use both addresses. The form's sign-ups go out the same
   way: the Worker's `send_email` binding sends from `hello@worncloset.app` to the `JOIN_TO`
   address, with the visitor as reply-to, which is free. To reply *as* `hello@worncloset.app`
   for free, add it in Gmail under Settings, Accounts and Import, "Send mail as" (SMTP server
   `smtp.gmail.com`, port 587, the Gmail address plus a Google App Password; the confirmation code
   arrives through the forwarding). So that this mail is not quarantined, the zone's `_dmarc` TXT
   has to be relaxed to `v=DMARC1; p=none;` and the root SPF TXT extended to
   `v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all` (still to do).
5. **Check after deploy:** `/`, `/closet`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`,
   `/closet/opengraph-image` all load; submit the form on each page and see the email arrive;
   paste the URL into a chat app to see the share card.

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
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Storage. |
| `OCR_PROVIDER_URL` | Receipt scanning. Google Cloud Vision works (`OCR_PROVIDER_FORMAT=google-vision`, key in `OCR_PROVIDER_API_KEY`); its free tier covers 1,000 images a month. |

Set these too (the API starts without them, but the feature answers 503 or refuses calls):

| Variable | Without it |
|---|---|
| `REDIS_URL` | The API worker can't start. |
| `R2_PUBLIC_URL=https://media.worncloset.app` | Image links point nowhere. |
| `CORS_ORIGIN=https://worncloset.app` | (This is the default.) |
| `GOOGLE_CLIENT_IDS` | Google sign-in fails. Web, iOS and Android client ids, comma-separated. |
| `ADMIN_SECRET` | Admin routes are refused. |
| `CASHBACK_WEBHOOK_SECRET` | Affiliate cashback confirmations are refused. |
| `APPLE_BUNDLE_ID`, `ANDROID_PACKAGE_NAME`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Coin purchases answer 503. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `OAUTH_TOKEN_SECRET`, `API_PUBLIC_URL` | Gmail connect (Closet) answers 503. Register `https://api.worncloset.app/ingestion/sources/oauth/callback` on the Google OAuth web client. |
| `SENTRY_DSN`, `POSTHOG_KEY` | No error reports or server analytics. |

The boot log lists every missing setting as an error or a warning.

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
