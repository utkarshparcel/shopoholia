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
