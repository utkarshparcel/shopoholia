import { Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { Redis } from "ioredis";
import {
  attachBullmqFailureReporting,
  initNodeSentry,
} from "@worn/shared/node-sentry";
import { processGiftOccasion, processTailoringTransition } from "./handler.js";
import { GIFT_OCCASION_QUEUE, TAILORING_QUEUE, type GiftOccasionPayload, type TailoringPayload } from "./queues.js";
import type { Db } from "@worn/db";

export interface GiftsWorkerConsumer { start(): Promise<void>; stop(): Promise<void>; }

export function createBullmqGiftWorker(options: { redisUrl?: string; connection?: Redis; db?: Db | null; concurrency?: number } = {}): GiftsWorkerConsumer & { readonly worker: Worker<GiftOccasionPayload> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) throw new Error("REDIS_URL required for gift worker");
  const own = !options.connection;
  const connection: Redis | RedisOptions = options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  const db = options.db ?? null;
  const worker = new Worker<GiftOccasionPayload>(
    GIFT_OCCASION_QUEUE,
    async (job, token) => {
      if (!db) throw new Error("Db required");
      const result = await processGiftOccasion(job.data, db);
      if (result.status === "delayed" && token) {
        await job.moveToDelayed(Date.now() + result.delayMs, token);
      }
    },
    { connection, concurrency: options.concurrency ?? 4 },
  );
  initNodeSentry({ worker: "gifts" });
  attachBullmqFailureReporting(worker, "gifts");
  return { worker, async start(){ await worker.waitUntilReady(); console.info(`[worker-gifts] gift queue ready`); }, async stop(){ await worker.close(); if(own && connection instanceof Redis) await (connection as Redis).quit().catch(()=>undefined); } };
}

export function createBullmqTailoringWorker(options: { redisUrl?: string; connection?: Redis; db?: Db | null; concurrency?: number } = {}): GiftsWorkerConsumer & { readonly worker: Worker<TailoringPayload> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) throw new Error("REDIS_URL required for tailoring worker");
  const own = !options.connection;
  const connection: Redis | RedisOptions = options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  const db = options.db ?? null;
  const worker = new Worker<TailoringPayload>(
    TAILORING_QUEUE,
    async (job, token) => {
      if (!db) throw new Error("Db required");
      const result = await processTailoringTransition(job.data, db);
      if (result && result.status === "delayed" && token) {
        await job.moveToDelayed(Date.now() + result.delayMs, token);
      }
    },
    { connection, concurrency: options.concurrency ?? 4 },
  );
  initNodeSentry({ worker: "gifts" });
  attachBullmqFailureReporting(worker, "tailoring");
  return { worker, async start(){ await worker.waitUntilReady(); console.info(`[worker-gifts] tailoring queue ready`); }, async stop(){ await worker.close(); if(own && connection instanceof Redis) await (connection as Redis).quit().catch(()=>undefined); } };
}

export function createMemoryGiftWorker(handler: (p: GiftOccasionPayload) => Promise<void>, opts: { autoProcess?: boolean } = {}): GiftsWorkerConsumer & { enqueue(p: GiftOccasionPayload, delayMs?: number): Promise<void>; flush(): Promise<void> } {
  const auto = opts.autoProcess ?? true;
  const pending: Array<{ payload: GiftOccasionPayload; timer?: ReturnType<typeof setTimeout> }> = [];
  return {
    async start(){}, async stop(){ for(const e of pending) if(e.timer) clearTimeout(e.timer); pending.length=0; },
    async enqueue(payload, delayMs=0){ const e:{payload: GiftOccasionPayload; timer?:ReturnType<typeof setTimeout>}={payload}; pending.push(e); if(!auto) return; e.timer=setTimeout(()=>{ void handler(payload).catch(()=>undefined); }, delayMs); },
    async flush(){ for(const e of pending) if(e.timer) clearTimeout(e.timer); for(const e of pending) await handler(e.payload); pending.length=0; },
  };
}

export function createMemoryTailoringWorker(handler: (p: TailoringPayload) => Promise<void>, opts: { autoProcess?: boolean } = {}): GiftsWorkerConsumer & { enqueue(p: TailoringPayload, delayMs?: number): Promise<void>; flush(): Promise<void> } {
  const auto = opts.autoProcess ?? true;
  const pending: Array<{ payload: TailoringPayload; timer?: ReturnType<typeof setTimeout> }> = [];
  return {
    async start(){}, async stop(){ for(const e of pending) if(e.timer) clearTimeout(e.timer); pending.length=0; },
    async enqueue(payload, delayMs=0){ const e:{payload: TailoringPayload; timer?:ReturnType<typeof setTimeout>}={payload}; pending.push(e); if(!auto) return; e.timer=setTimeout(()=>{ void handler(payload).catch(()=>undefined); }, delayMs); },
    async flush(){ for(const e of pending) if(e.timer) clearTimeout(e.timer); for(const e of pending) await handler(e.payload); pending.length=0; },
  };
}

export * from "./queues.js";
export * from "./handler.js";
