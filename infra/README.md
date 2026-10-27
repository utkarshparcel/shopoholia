# Local infrastructure

PostgreSQL 16 and Redis 7 for WORN local development.

## Start

```bash
docker compose -f infra/docker-compose.yml up -d
```

## Connection strings

| Service    | URL |
|------------|-----|
| PostgreSQL | `postgresql://worn:worn@localhost:5432/worn` |
| Redis      | `redis://localhost:6379` |

## Postgres workflow

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Run migrations: `pnpm --filter @worn/db db:migrate`
3. Seed catalog: `pnpm --filter @worn/api seed:postgres`
4. Start API with `DATABASE_URL` set: `pnpm dev:api`

The seed script is idempotent — it skips when listings already exist.

## Background workers

Each needs `REDIS_URL` and `DATABASE_URL`; jobs that fail for good land in the
`job_dead_letters` table.

| Process | Command | Queues |
|---------|---------|--------|
| API worker | `pnpm --filter @worn/api worker` | every queue in `apps/api/src/jobs/registry.ts`, plus its schedules (retention sweep and the other periodic jobs) |
| Ingest | `pnpm --filter @worn/worker-ingest worker` | `ingest-email` (also needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` for Gmail) |
| Expiry | `pnpm --filter @worn/worker-expiry worker` | `credit-expiry`, `warranty-expiry`, `credit-balance-recheck`, `cashback-claim-deadline` |
| Wardrobe | `pnpm --filter @worn/worker-wardrobe worker` | `outfit-generation`, `dry-clean-pickup` |
| Returns | `pnpm --filter @worn/worker-returns worker` | `return-deadline` |
| Gifts | `pnpm --filter @worn/worker-gifts worker` | `gift-occasion`, `tailoring-orders` |
| Nudge | `pnpm --filter @worn/worker-nudge worker` | `closet-nudge` |

Queue tests run against a real Redis when `TEST_REDIS_URL` is set, e.g.
`TEST_REDIS_URL=redis://localhost:6379 pnpm --filter @worn/worker-gifts test`.

## Stop / reset

```bash
# Stop containers
docker compose -f infra/docker-compose.yml down

# Stop and remove volumes (wipes DB + Redis data)
docker compose -f infra/docker-compose.yml down -v
```

## Health

Postgres readiness: `pg_isready -U worn -d worn -h localhost`

Redis: `redis-cli ping`
