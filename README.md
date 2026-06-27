# WORN

A fashion marketplace where the **shopping arc is the product**. Nothing ships — users get the full e-commerce loop (browse, cart, checkout, wait, track, unbox) and the reward is AI renders of them wearing what they "bought."

## Monorepo layout

```
worn/
├── apps/
│   ├── mobile/          # Expo Router (iOS + Android)
│   └── api/             # Fastify HTTP API
├── services/
│   ├── worker-orders/   # BullMQ: order state machine + timers
│   └── worker-render/   # BullMQ: render pipeline
├── packages/
│   ├── shared/          # Zod schemas, DTOs, economy constants
│   ├── db/              # Drizzle schema + migrations
│   └── config/          # Env validation, shared ESLint/TSConfig
├── infra/               # docker-compose (PostgreSQL, Redis)
└── docs/                # Product spec, design system, implementation plan
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Docker](https://www.docker.com/) (for local PostgreSQL + Redis)
- [Expo Go](https://expo.dev/go) or iOS Simulator / Android emulator for mobile dev
- [EAS CLI](https://docs.expo.dev/build/setup/) (`npm i -g eas-cli`) for beta builds

## Quick start (local dev)

```bash
# Install dependencies
pnpm install

# Start local infrastructure (PostgreSQL 16 + Redis 7)
docker compose -f infra/docker-compose.yml up -d

# Apply Drizzle migrations (requires DATABASE_URL in .env)
cp .env.example .env   # first time only
pnpm --filter @worn/db db:migrate

# Optional: seed catalog into Postgres (50 listings)
pnpm --filter @worn/api seed:postgres

# Optional: import external catalog JSONL (Shein/Newme samples in apps/api/scripts/)
# Re-running import-catalog inserts duplicate rows — truncate listings first or use a fresh DB.
# DATABASE_URL=postgresql://worn:worn@localhost:5432/worn \
#   pnpm --filter @worn/api import-catalog -- --file scripts/sample-catalog.jsonl

# Build shared packages
pnpm build

# Terminal 1 — API
# Without DATABASE_URL: in-memory repos + mock R2 (default for quick start / CI)
pnpm dev:api

# With Postgres:
# DATABASE_URL=postgresql://worn:worn@localhost:5432/worn pnpm dev:api

# Terminal 2 — Expo mobile app
pnpm --filter @worn/mobile start
```

Copy `.env.example` to `.env` at the repo root when wiring Postgres-backed API or observability. Sentry is env-gated and no-ops without a DSN.

### Postgres-backed API

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | For Postgres mode | e.g. `postgresql://worn:worn@localhost:5432/worn` |

When `DATABASE_URL` is set, the API uses Postgres for users, avatars, coin ledger, listings, sellers, carts, orders, renders, try-on previews, and push events. OTP codes and refresh tokens stay in-memory (no DB tables yet). Without `DATABASE_URL`, all repos use in-memory storage (CI default).

### Cloudflare R2 storage

| Variable | Required | Description |
|----------|----------|-------------|
| `R2_ACCOUNT_ID` | For real R2 | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | For real R2 | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | For real R2 | R2 API token secret |
| `R2_BUCKET_NAME` | For real R2 | Target bucket |
| `R2_PUBLIC_URL` | Optional | Public bucket URL; skips presigned URLs when set |

When all four required `R2_*` vars are set, uploads use the S3-compatible R2 client. Otherwise the API uses an in-memory mock store.

### Local service URLs

| Service    | URL / connection string                          |
|------------|--------------------------------------------------|
| API        | `http://localhost:3000`                          |
| PostgreSQL | `postgresql://worn:worn@localhost:5432/worn`   |
| Redis      | `redis://localhost:6379`                         |
| Mobile API | `apps/mobile/app.json` → `extra.apiUrl`        |

### Dev auth

Phone OTP is stubbed in dev: use `919876543210` / `123456` on the avatar onboarding screen (auto-login).

### Run tests

```bash
pnpm test
```

### FASHN.ai render spike (Week 2)

Virtual try-on uses [FASHN.ai](https://docs.fashn.ai/) when `FASHN_API_KEY` is set; otherwise the API falls back to `mock-fashn` (deterministic keys, no HTTP, fixed `cost_micros`).

1. Create an API key at [app.fashn.ai](https://app.fashn.ai) → Developer API dashboard.
2. Add to repo-root `.env`:

   ```bash
   FASHN_API_KEY=your_key_here
   ```

3. Run the spike with local model + garment images (JPEG/PNG):

   ```bash
   pnpm --filter @worn/api render-spike ./path/to/model.jpg ./path/to/garment.jpg
   ```

   Optional third argument sets the output directory (default: `tmp/render-spike`).

The spike calls `tryon-max` (2k, balanced), polls until complete, saves the result JPEG, and logs duration, FASHN credits (`x-fashn-credits-used`), and internal `cost_micros` (25 000 micros per credit).

| Mode | When | Behavior |
|------|------|----------|
| **mock-fashn** | No `FASHN_API_KEY` | Instant fake keys; avatar + scenario pass mocked |
| **fashn (live)** | Key set | Real HTTP to `api.fashn.ai`; try-on only (scenario pass still mocked until ComfyUI spike) |

CI tests mock `fetch` — no live API calls in `pnpm test`.

## Beta deploy (TestFlight + Play internal)

`apps/mobile/eas.json` scaffolds two beta profiles — no builds are run from CI yet.

```bash
cd apps/mobile

# One-time: link Expo project
eas login
eas init

# iOS TestFlight (store distribution)
eas build --profile testflight --platform ios
eas submit --profile testflight --platform ios

# Android Play internal track
eas build --profile play-internal --platform android
eas submit --profile play-internal --platform android
```

Set env vars for submit (`APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID`, `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`) in EAS secrets or your shell before submit.

### Beta observability

| Concern | Env var | Notes |
|---------|---------|-------|
| API errors | `SENTRY_DSN` | Scaffolded in `@worn/api`; no-op without DSN |
| Mobile crashes | `EXPO_PUBLIC_SENTRY_DSN` | Scaffolded in mobile; no-op without DSN |
| Funnel events | console (dev) | `trackEvent()` in mobile; swap sink for PostHog/Mixpanel |
| Reveal satisfaction | `POST /orders/:id/reveal/rating` | 1-tap survey → API stub + `reveal_rated` event |

## Scripts

| Command          | Description                          |
|------------------|--------------------------------------|
| `pnpm dev`       | Start all workspaces in dev mode     |
| `pnpm dev:api`   | Run API only                         |
| `pnpm build`     | Build all packages and apps          |
| `pnpm test`      | Run all workspace tests              |
| `pnpm --filter @worn/api render-spike` | FASHN try-on spike (needs `FASHN_API_KEY`) |
| `pnpm --filter @worn/api seed:postgres` | Insert `buildSeedListings(50)` into Postgres |
| `pnpm --filter @worn/api import-catalog` | Import JSONL/CSV catalog rows into Postgres (not idempotent — truncate before re-import) |
| `pnpm --filter @worn/db db:migrate` | Apply Drizzle migrations |
| `pnpm lint`      | Lint across the monorepo             |
| `pnpm typecheck` | Type-check across the monorepo       |

## Docs

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md)
- [Product spec](docs/worn-spec.html)
- [Design system](docs/design-system/)
