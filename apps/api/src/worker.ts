import { createDb, recordJobDeadLetter } from "@worn/db";
import { decryptToken } from "@worn/shared/token-crypto";
import pino from "pino";
import type { JobDeps } from "./jobs/deps.js";
import { JOB_HANDLERS, JOB_SCHEDULES } from "./jobs/registry.js";
import { startJobRunner, type JobRunnerAlert } from "./jobs/runner.js";
import { createPurchaseVerifier } from "./lib/coin-purchases.js";
import { storeConnectionsFromEnv } from "./lib/iap/stores.js";
import { createRenderProvider } from "./lib/render/provider.js";
import { createPostgresRepositories } from "./lib/repositories/postgres.js";
import { captureException, initSentry } from "./lib/sentry.js";
import { createStorageFromEnv, hasR2Config } from "./lib/storage/r2.js";

/**
 * The background worker: `pnpm --filter @worn/api worker`. Consumes every queue in
 * jobs/registry.ts and keeps its schedules. Needs REDIS_URL and DATABASE_URL (dead letters go to
 * Postgres, so there is no in-memory mode), and R2 in production (the retention sweep deletes
 * blobs).
 */

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; the worker cannot start`);
  return value;
}

async function main() {
  initSentry();
  const log = pino({ name: "worn-worker" });
  const redisUrl = requiredEnv("REDIS_URL");
  const db = createDb(requiredEnv("DATABASE_URL"));
  if (process.env.NODE_ENV === "production" && !hasR2Config(process.env)) {
    throw new Error("R2 is not configured; the worker cannot purge ingestion blobs in production");
  }

  const recordDeadLetter: JobDeps["recordDeadLetter"] = async (entry) => {
    await recordJobDeadLetter(db, entry);
  };
  const alert: JobRunnerAlert = (message, context, error) => {
    log.error({ ...context, err: error }, `[jobs] ${message}`);
    const tags = Object.fromEntries(Object.entries(context).map(([key, value]) => [key, String(value)]));
    captureException(error ?? new Error(message), { tags });
  };

  const storage = createStorageFromEnv();
  const storeConnections = storeConnectionsFromEnv();
  const runner = await startJobRunner<JobDeps>({
    redisUrl,
    handlers: JOB_HANDLERS,
    schedules: JOB_SCHEDULES,
    deps: {
      repos: createPostgresRepositories(db),
      storage,
      log,
      recordDeadLetter,
      now: () => new Date(),
      renderProvider: createRenderProvider({
        apiKey: process.env.FASHN_API_KEY,
        resolveImage: (key) => storage.getSignedUrl(key),
      }),
      storeConnections,
      purchaseVerifier: createPurchaseVerifier(storeConnections),
      decryptToken,
    },
    recordDeadLetter,
    alert,
    info: (message, context) => log.info(context, `[jobs] ${message}`),
  });

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "[jobs] stopping; waiting for jobs in flight");
    await runner.close();
    await db.$client.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

main().catch((err: unknown) => {
  console.error("[jobs] worker failed to start", err);
  captureException(err);
  process.exit(1);
});
