import { createDb } from "@worn/db";
import {
  createBullmqBalanceRecheckWorker,
  createBullmqCashbackClaimWorker,
  createBullmqExpiryWorker,
  createBullmqWarrantyWorker,
} from "./index.js";

/** Process entry: `pnpm --filter @worn/worker-expiry worker` (REDIS_URL, DATABASE_URL). */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the expiry worker");
const db = createDb(databaseUrl);
const consumers = [
  createBullmqExpiryWorker({ db }),
  createBullmqWarrantyWorker({ db }),
  createBullmqBalanceRecheckWorker({ db }),
  createBullmqCashbackClaimWorker({ db }),
];
await Promise.all(consumers.map((consumer) => consumer.start()));

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void Promise.allSettled(consumers.map((consumer) => consumer.stop()))
      .then(() => db.$client.end({ timeout: 5 }))
      .finally(() => process.exit(0));
  });
}
