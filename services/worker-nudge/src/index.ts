import { Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { Redis } from "ioredis";
import {
  attachBullmqFailureReporting,
  initNodeSentry,
} from "@worn/shared/node-sentry";
import { processFoundMoneyWaiting, processMonthlyDigest, processWeeklyDigest } from "./handler.js";
import {
  FOUND_MONEY_WAITING_JOB,
  MONTHLY_DIGEST_JOB,
  NUDGE_QUEUE,
  WEEKLY_DIGEST_JOB,
  type FoundMoneyWaitingPayload,
  type MonthlyDigestPayload,
  type WeeklyDigestPayload,
} from "./queues.js";
import type { Db } from "@worn/db";

export interface NudgeWorkerConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type NudgeJobPayload =
  | FoundMoneyWaitingPayload
  | WeeklyDigestPayload
  | MonthlyDigestPayload;

export function createBullmqNudgeWorker(
  options: {
    redisUrl?: string;
    connection?: Redis;
    db?: Db | null;
    concurrency?: number;
  } = {},
): NudgeWorkerConsumer & { readonly worker: Worker } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error("REDIS_URL required for nudge worker");
  }
  const own = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ??
    new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  const db = options.db ?? null;

  const worker = new Worker(
    NUDGE_QUEUE,
    async (job, token) => {
      if (!db) throw new Error("Db required");
      let result;
      if (job.name === WEEKLY_DIGEST_JOB) {
        result = await processWeeklyDigest(job.data as WeeklyDigestPayload, db);
      } else if (job.name === MONTHLY_DIGEST_JOB) {
        result = await processMonthlyDigest(job.data as MonthlyDigestPayload, db);
      } else {
        result = await processFoundMoneyWaiting(
          job.data as FoundMoneyWaitingPayload,
          db,
        );
      }
      if (result.status === "delayed" && token) {
        await job.moveToDelayed(Date.now() + result.delayMs, token);
      }
    },
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env.NUDGE_CONCURRENCY ?? 4),
    },
  );

  initNodeSentry({ worker: "nudge" });
  attachBullmqFailureReporting(worker, "nudge");

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(
        `[worker-nudge] BullMQ ready on "${NUDGE_QUEUE}" (${FOUND_MONEY_WAITING_JOB}, ${WEEKLY_DIGEST_JOB}, ${MONTHLY_DIGEST_JOB})`,
      );
    },
    async stop() {
      await worker.close();
      if (own && connection instanceof Redis) {
        await connection.quit().catch(() => undefined);
      }
    },
  };
}

export function createMemoryNudgeWorker(
  handler: (name: string, payload: NudgeJobPayload) => Promise<void>,
  opts: { autoProcess?: boolean } = {},
): NudgeWorkerConsumer & {
  enqueue(
    name: string,
    payload: NudgeJobPayload,
    delayMs?: number,
  ): Promise<void>;
  flush(): Promise<void>;
} {
  const auto = opts.autoProcess ?? true;
  const pending: Array<{
    name: string;
    payload: NudgeJobPayload;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];
  return {
    async start() {},
    async stop() {
      for (const e of pending) if (e.timer) clearTimeout(e.timer);
      pending.length = 0;
    },
    async enqueue(name, payload, delayMs = 0) {
      const e: {
        name: string;
        payload: NudgeJobPayload;
        timer?: ReturnType<typeof setTimeout>;
      } = { name, payload };
      pending.push(e);
      if (!auto) return;
      e.timer = setTimeout(() => {
        void handler(name, payload).catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      for (const e of pending) if (e.timer) clearTimeout(e.timer);
      for (const e of pending) await handler(e.name, e.payload);
      pending.length = 0;
    },
  };
}

export * from "./queues.js";
export * from "./handler.js";
