import { DelayedError, Queue, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import {
  DEFAULT_JOB_ATTEMPTS,
  DEFAULT_JOB_BACKOFF,
  JOB_REMOVE_ON_COMPLETE,
  JOB_REMOVE_ON_FAIL,
  attachStalledDeadLetters,
  createJobProcessor,
  deadLetterAlert,
  settlePushResult,
  type DeadLetter,
  type ProcessPushResult,
} from "@worn/shared";
import { captureNodeException, initNodeSentry } from "@worn/shared/node-sentry";
import { processGiftOccasion, processTailoringTransition } from "./handler.js";
import {
  GIFT_OCCASION_JOB,
  GIFT_OCCASION_QUEUE,
  TAILORING_JOB,
  TAILORING_QUEUE,
  type GiftOccasionPayload,
  type TailoringPayload,
} from "./queues.js";
import { recordJobDeadLetter, type Db } from "@worn/db";

export interface GiftsWorkerConsumer { start(): Promise<void>; stop(): Promise<void>; }

export interface GiftsWorkerOptions<T> {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  handler?: (payload: T) => Promise<void>;
  /** Where final failures go; defaults to job_dead_letters in `db`. */
  recordDeadLetter?: (entry: DeadLetter) => Promise<void>;
  concurrency?: number;
}

function createPushJobWorker<T>(
  spec: {
    queue: string;
    jobName: string;
    label: string;
    concurrencyEnv: string;
    /** Runs once the connection exists; `close` runs after the worker has stopped. */
    build: (connection: Redis) => {
      process: (payload: T, db: Db) => Promise<ProcessPushResult>;
      close?: () => Promise<void>;
    };
  },
  options: GiftsWorkerOptions<T>,
): GiftsWorkerConsumer & { readonly worker: Worker<T> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error(`REDIS_URL or an explicit connection is required for the ${spec.label} worker`);
  }
  const db = options.db ?? null;
  // Without a Db every job would fail: refuse to start instead.
  if (!db && !(options.handler && options.recordDeadLetter)) {
    throw new Error(`A Db is required for the ${spec.label} worker`);
  }
  const ownConnection = !options.connection;
  const connection = options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });
  const built = spec.build(connection);
  const handle =
    options.handler ??
    (async (payload: T) => settlePushResult(spec.queue, await built.process(payload, db!)));
  const recordDeadLetter =
    options.recordDeadLetter ?? (async (entry: DeadLetter) => void (await recordJobDeadLetter(db!, entry)));

  initNodeSentry({ worker: "gifts" });
  const onDeadLetter = deadLetterAlert((err, tags) => captureNodeException(err, { worker: "gifts", ...tags }));
  const worker = new Worker<T>(
    spec.queue,
    createJobProcessor<T>({
      queue: spec.queue,
      handle,
      recordDeadLetter,
      onDeadLetter,
      errors: { DelayedError, UnrecoverableError },
    }),
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env[spec.concurrencyEnv] ?? 4),
      removeOnComplete: JOB_REMOVE_ON_COMPLETE,
      removeOnFail: JOB_REMOVE_ON_FAIL,
    },
  );
  worker.on("error", (err) => console.error(`[worker-gifts] ${spec.queue} worker error:`, err.message));
  attachStalledDeadLetters(worker, { queue: spec.queue, recordDeadLetter, onDeadLetter });

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(`[worker-gifts] BullMQ worker ready on queue "${spec.queue}" (job "${spec.jobName}")`);
    },
    async stop() {
      await worker.close();
      await built.close?.();
      if (ownConnection) await connection.quit().catch(() => undefined);
    },
  };
}

export function createBullmqGiftWorker(
  options: GiftsWorkerOptions<GiftOccasionPayload> = {},
): GiftsWorkerConsumer & { readonly worker: Worker<GiftOccasionPayload> } {
  return createPushJobWorker<GiftOccasionPayload>(
    {
      queue: GIFT_OCCASION_QUEUE,
      jobName: GIFT_OCCASION_JOB,
      label: "gift",
      concurrencyEnv: "GIFT_CONCURRENCY",
      build: () => ({ process: (payload, db) => processGiftOccasion(payload, db) }),
    },
    options,
  );
}

export function createBullmqTailoringWorker(
  options: GiftsWorkerOptions<TailoringPayload> = {},
): GiftsWorkerConsumer & { readonly worker: Worker<TailoringPayload> } {
  return createPushJobWorker<TailoringPayload>(
    {
      queue: TAILORING_QUEUE,
      jobName: TAILORING_JOB,
      label: "tailoring",
      concurrencyEnv: "TAILORING_CONCURRENCY",
      build: (connection) => {
        // Each step schedules the next one on the same queue.
        const next = new Queue<TailoringPayload>(TAILORING_QUEUE, {
          connection,
          defaultJobOptions: {
            attempts: DEFAULT_JOB_ATTEMPTS,
            backoff: DEFAULT_JOB_BACKOFF,
            removeOnComplete: JOB_REMOVE_ON_COMPLETE,
            removeOnFail: JOB_REMOVE_ON_FAIL,
          },
        });
        return {
          process: (payload, db) =>
            processTailoringTransition(payload, db, {
              enqueueNext: async (data, jobOptions) => void (await next.add(TAILORING_JOB, data, jobOptions)),
            }),
          close: () => next.close(),
        };
      },
    },
    options,
  );
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
