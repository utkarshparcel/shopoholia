import { createDb } from "@worn/db";
import { createBullmqNudgeWorker } from "./index.js";

/** Process entry: `pnpm --filter @worn/worker-nudge worker` (REDIS_URL, DATABASE_URL). */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the nudge worker");
const db = createDb(databaseUrl);
const consumer = createBullmqNudgeWorker({ db });
await consumer.start();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void consumer
      .stop()
      .then(() => db.$client.end({ timeout: 5 }))
      .finally(() => process.exit(0));
  });
}
