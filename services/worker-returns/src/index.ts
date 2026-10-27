import { Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { Redis } from "ioredis";
import {
  attachBullmqFailureReporting,
  initNodeSentry,
} from "@worn/shared/node-sentry";
import { processReturnDeadline } from "./handler.js";
import {
  RETURN_DEADLINE_JOB,
  RETURN_DEADLINE_QUEUE,
  type ReturnDeadlinePayload,
} from "./queues.js";
import type { Db } from "@worn/db";

export interface ReturnsWorkerConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type ReturnsHandler = (payload: ReturnDeadlinePayload) => Promise<void>;

export interface BullmqReturnsOptions {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  handler?: ReturnsHandler;
  concurrency?: number;
}

export function createBullmqReturnsWorker(
  options: BullmqReturnsOptions = {},
): ReturnsWorkerConsumer & { readonly worker: Worker<ReturnDeadlinePayload> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error("REDIS_URL or an explicit connection is required for the returns worker");
  }
  const ownConnection = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  const db = options.db ?? null;
  const handler: ReturnsHandler =
    options.handler ??
    (async (payload) => {
      if (!db) throw new Error("A Db is required to process return deadline");
      await processReturnDeadline(payload, db);
    });

  const worker = new Worker<ReturnDeadlinePayload>(
    RETURN_DEADLINE_QUEUE,
    async (job, token) => {
      if (options.handler) {
        await handler(job.data);
        return;
      }
      if (!db) throw new Error("A Db is required to process return deadline");
      const result = await processReturnDeadline(job.data, db);
      if (result.status === "delayed" && token) {
        await job.moveToDelayed(Date.now() + result.delayMs, token);
      }
    },
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env.RETURN_CONCURRENCY ?? 4),
    },
  );

  initNodeSentry({ worker: "returns" });
  attachBullmqFailureReporting(worker, "returns");

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(`[worker-returns] BullMQ worker ready on queue "${RETURN_DEADLINE_QUEUE}" (job "${RETURN_DEADLINE_JOB}")`);
    },
    async stop() {
      await worker.close();
      if (ownConnection && connection instanceof Redis) {
        await connection.quit().catch(() => undefined);
      }
    },
  };
}

export interface MemoryReturnsOptions {
  autoProcess?: boolean;
}

export function createMemoryReturnsWorker(
  handler: ReturnsHandler,
  options: MemoryReturnsOptions = {},
): ReturnsWorkerConsumer & {
  readonly queue: string;
  enqueue(payload: ReturnDeadlinePayload, delayMs?: number): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const pending: Array<{ payload: ReturnDeadlinePayload; timer?: ReturnType<typeof setTimeout> }> = [];

  return {
    queue: RETURN_DEADLINE_QUEUE,
    async start() {},
    async stop() {
      for (const entry of pending) if (entry.timer) clearTimeout(entry.timer);
      pending.length = 0;
    },
    async enqueue(payload, delayMs = 0) {
      const entry: { payload: ReturnDeadlinePayload; timer?: ReturnType<typeof setTimeout> } = { payload };
      pending.push(entry);
      if (!autoProcess) return;
      entry.timer = setTimeout(() => {
        void handler(payload).catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      for (const entry of pending) if (entry.timer) clearTimeout(entry.timer);
      for (const entry of pending) await handler(entry.payload);
      pending.length = 0;
    },
  };
}

export { RETURN_DEADLINE_QUEUE, RETURN_DEADLINE_JOB } from "./queues.js";
export { processReturnDeadline, RETURN_DEADLINE_EVENT } from "./handler.js";
export type { ReturnDeadlinePayload } from "./queues.js";
