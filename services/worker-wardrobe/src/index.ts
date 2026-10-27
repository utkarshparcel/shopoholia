import { DelayedError, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  JOB_REMOVE_ON_COMPLETE,
  JOB_REMOVE_ON_FAIL,
  attachStalledDeadLetters,
  createJobProcessor,
  deadLetterAlert,
  settlePushResult,
  type DeadLetter,
} from "@worn/shared";
import { captureNodeException, initNodeSentry } from "@worn/shared/node-sentry";
import { processOutfit } from "./handler.js";
import { processDryCleanPickupJob } from "./dry-clean.js";
import {
  DRY_CLEAN_QUEUE,
  OUTFIT_QUEUE,
  type DryCleanPickupPayload,
  type OutfitPayload,
} from "./queues.js";
import { recordJobDeadLetter, type Db } from "@worn/db";

export interface WardrobeWorkerConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}
export type WardrobeHandler = (payload: OutfitPayload) => Promise<void>;

export interface BullmqWardrobeOptions {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  /** Replaces the outfit handler (tests); the dry-clean queue still needs `db`. */
  handler?: WardrobeHandler;
  /** Where final failures go; defaults to job_dead_letters in `db`. */
  recordDeadLetter?: (entry: DeadLetter) => Promise<void>;
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
    throw new Error("REDIS_URL or an explicit connection is required for worker-wardrobe");
  }
  const db = options.db ?? null;
  // Without a Db every job would fail: refuse to start instead.
  if (!db) throw new Error("A Db is required for worker-wardrobe");
  const recordDeadLetter =
    options.recordDeadLetter ?? (async (entry: DeadLetter) => void (await recordJobDeadLetter(db, entry)));
  const ownConnection = !options.connection;
  const connection = options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  initNodeSentry({ worker: "wardrobe" });
  const onDeadLetter = deadLetterAlert((err, tags) => captureNodeException(err, { worker: "wardrobe", ...tags }));
  const handleOutfit: WardrobeHandler =
    options.handler ??
    (async (payload) => {
      const result = await processOutfit(payload, db);
      if (result.push) settlePushResult(OUTFIT_QUEUE, result.push);
    });
  const worker = new Worker<OutfitPayload>(
    OUTFIT_QUEUE,
    createJobProcessor<OutfitPayload>({
      queue: OUTFIT_QUEUE,
      handle: handleOutfit,
      recordDeadLetter,
      onDeadLetter,
      errors: { DelayedError, UnrecoverableError },
    }),
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env.WARDROBE_CONCURRENCY ?? 4),
      removeOnComplete: JOB_REMOVE_ON_COMPLETE,
      removeOnFail: JOB_REMOVE_ON_FAIL,
    },
  );

  const dryCleanWorker = new Worker<DryCleanPickupPayload>(
    DRY_CLEAN_QUEUE,
    createJobProcessor<DryCleanPickupPayload>({
      queue: DRY_CLEAN_QUEUE,
      handle: async (payload) => settlePushResult(DRY_CLEAN_QUEUE, await processDryCleanPickupJob(payload, db)),
      recordDeadLetter,
      onDeadLetter,
      errors: { DelayedError, UnrecoverableError },
    }),
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env.DRY_CLEAN_CONCURRENCY ?? 2),
      removeOnComplete: JOB_REMOVE_ON_COMPLETE,
      removeOnFail: JOB_REMOVE_ON_FAIL,
    },
  );

  for (const [queue, w] of [
    [OUTFIT_QUEUE, worker],
    [DRY_CLEAN_QUEUE, dryCleanWorker],
  ] as const) {
    w.on("error", (err) => console.error(`[worker-wardrobe] ${queue} worker error:`, err.message));
    attachStalledDeadLetters(w, { queue, recordDeadLetter, onDeadLetter });
  }
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
      if (ownConnection) await connection.quit().catch(() => undefined);
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
