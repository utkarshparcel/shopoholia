import { createDb } from "@worn/db";
import { createBullmqGiftWorker, createBullmqTailoringWorker } from "./index.js";

/** Process entry: `pnpm --filter @worn/worker-gifts worker` (REDIS_URL, DATABASE_URL). */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the gifts worker");
const db = createDb(databaseUrl);
const consumers = [createBullmqGiftWorker({ db }), createBullmqTailoringWorker({ db })];
await Promise.all(consumers.map((consumer) => consumer.start()));

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void Promise.allSettled(consumers.map((consumer) => consumer.stop()))
      .then(() => db.$client.end({ timeout: 5 }))
      .finally(() => process.exit(0));
  });
}
