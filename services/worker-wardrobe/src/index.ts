import { Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { Redis } from "ioredis";
import {
  attachBullmqFailureReporting,
  initNodeSentry,
} from "@worn/shared/node-sentry";
import { processOutfit } from "./handler.js";
import { processDryCleanPickupJob } from "./dry-clean.js";
import {
  DRY_CLEAN_QUEUE,
  OUTFIT_QUEUE,
  type DryCleanPickupPayload,
  type OutfitPayload,
} from "./queues.js";
import type { Db } from "@worn/db";

export interface WardrobeWorkerConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}
export type WardrobeHandler = (payload: OutfitPayload) => Promise<void>;

export interface BullmqWardrobeOptions {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  handler?: WardrobeHandler;
  concurrency?: number;
}

export function createBullmqWardrobeWorker(
  options: BullmqWardrobeOptions = {},
): WardrobeWorkerConsumer & {
  readonly worker: Worker<OutfitPayload>;
  readonly dryCleanWorker: Worker<DryCleanPickupPayload>;
} {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error("REDIS_URL or explicit connection required for worker-wardrobe");
  }
  const ownConnection = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  const db = options.db ?? null;
  const handler: WardrobeHandler =
    options.handler ??
    (async (payload) => {
      if (!db) throw new Error("Db required");
      await processOutfit(payload, db);
    });
  const worker = new Worker<OutfitPayload>(
    OUTFIT_QUEUE,
    async (job, token) => {
      if (options.handler) {
        await handler(job.data);
        return;
      }
      if (!db) throw new Error("Db required");
      const result = await processOutfit(job.data, db);
      if (result.push?.status === "delayed" && token) {
        await job.moveToDelayed(Date.now() + result.push.delayMs, token);
      }
    },
    { connection, concurrency: options.concurrency ?? Number(process.env.WARDROBE_CONCURRENCY ?? 4) },
  );

  const dryCleanWorker = new Worker<DryCleanPickupPayload>(
    DRY_CLEAN_QUEUE,
    async (job, token) => {
      if (!db) throw new Error("Db required");
      const result = await processDryCleanPickupJob(job.data, db);
      if (result.status === "delayed" && token && "delayMs" in result) {
        await job.moveToDelayed(Date.now() + result.delayMs, token);
      }
    },
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env.DRY_CLEAN_CONCURRENCY ?? 2),
    },
  );

  initNodeSentry({ worker: "wardrobe" });
  attachBullmqFailureReporting(worker, "wardrobe");
  attachBullmqFailureReporting(dryCleanWorker, "wardrobe-dryclean");
  return {
    worker,
    dryCleanWorker,
    async start() {
      await worker.waitUntilReady();
      await dryCleanWorker.waitUntilReady();
      console.info(`[worker-wardrobe] ready queues "${OUTFIT_QUEUE}", "${DRY_CLEAN_QUEUE}"`);
    },
    async stop() {
      await worker.close();
      await dryCleanWorker.close();
      if (ownConnection && connection instanceof Redis) {
        await connection.quit().catch(() => undefined);
      }
    },
  };
}

export interface MemoryWardrobeOptions {
  autoProcess?: boolean;
}

export function createMemoryWardrobeWorker(
  handler: WardrobeHandler,
  options: MemoryWardrobeOptions = {},
): WardrobeWorkerConsumer & {
  readonly queue: string;
  enqueue(payload: OutfitPayload, delayMs?: number): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const pending: Array<{
    payload: OutfitPayload;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];
  return {
    queue: OUTFIT_QUEUE,
    async start() {},
    async stop() {
      for (const e of pending) if (e.timer) clearTimeout(e.timer);
      pending.length = 0;
    },
    async enqueue(payload, delayMs = 0) {
      const entry: { payload: OutfitPayload; timer?: ReturnType<typeof setTimeout> } = {
        payload,
      };
      pending.push(entry);
      if (!autoProcess) return;
      entry.timer = setTimeout(() => {
        void handler(payload).catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      for (const e of pending) {
        if (e.timer) clearTimeout(e.timer);
      }
      for (const e of pending) {
        await handler(e.payload);
      }
      pending.length = 0;
    },
  };
}

export {
  OUTFIT_QUEUE,
  OUTFIT_JOB,
  DRY_CLEAN_QUEUE,
  DRY_CLEAN_JOB,
  DRY_CLEAN_PICKUP_EVENT,
} from "./queues.js";
export { processOutfit, OUTFIT_EVENT } from "./handler.js";
export { processDryCleanPickupJob } from "./dry-clean.js";
export type { OutfitPayload, DryCleanPickupPayload } from "./queues.js";
