import { DelayedError, UnrecoverableError, Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { Redis } from "ioredis";
import {
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
import {
  processBalanceRecheck,
  processCashbackClaimDeadline,
  processExpiry,
  processWarrantyExpiry,
} from "./handler.js";
import {
  BALANCE_RECHECK_JOB,
  BALANCE_RECHECK_QUEUE,
  CASHBACK_CLAIM_JOB,
  CASHBACK_CLAIM_QUEUE,
  CREDIT_EXPIRY_JOB,
  CREDIT_EXPIRY_QUEUE,
  WARRANTY_EXPIRY_JOB,
  WARRANTY_EXPIRY_QUEUE,
  type BalanceRecheckPayload,
  type CashbackClaimDeadlinePayload,
  type CreditExpiryPayload,
  type WarrantyExpiryPayload,
} from "./queues.js";
import { recordJobDeadLetter, type Db } from "@worn/db";

export interface ExpiryWorkerConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

type PushJobWorkerOptions<T> = {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  handler?: (payload: T) => Promise<void>;
  /** Where final failures go; defaults to job_dead_letters in `db`. */
  recordDeadLetter?: (entry: DeadLetter) => Promise<void>;
  concurrency?: number;
};

/**
 * One queue's BullMQ consumer: quiet hours delay the job without spending an attempt, a failed
 * send is retried, and the last failure is written to job_dead_letters and alerted.
 */
function createPushJobWorker<T>(
  spec: {
    queue: string;
    jobName: string;
    label: string;
    concurrencyEnv: string;
    process: (payload: T, db: Db) => Promise<ProcessPushResult>;
  },
  options: PushJobWorkerOptions<T>,
): ExpiryWorkerConsumer & { readonly worker: Worker<T> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error(
      `REDIS_URL or an explicit connection is required for the BullMQ ${spec.label} worker`,
    );
  }
  const db = options.db ?? null;
  // Without a Db every job would fail: refuse to start instead.
  if (!db && !(options.handler && options.recordDeadLetter)) {
    throw new Error(`A Db is required for the BullMQ ${spec.label} worker`);
  }
  const handle =
    options.handler ??
    (async (payload: T) => settlePushResult(spec.queue, await spec.process(payload, db!)));
  const recordDeadLetter =
    options.recordDeadLetter ?? (async (entry: DeadLetter) => void (await recordJobDeadLetter(db!, entry)));

  const ownConnection = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ??
    new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  initNodeSentry({ worker: "expiry" });
  const onDeadLetter = deadLetterAlert((err, tags) => captureNodeException(err, { worker: "expiry", ...tags }));
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
  worker.on("error", (err) => console.error(`[worker-expiry] ${spec.queue} worker error:`, err.message));
  attachStalledDeadLetters(worker, { queue: spec.queue, recordDeadLetter, onDeadLetter });

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(
        `[worker-expiry] BullMQ worker ready on queue "${spec.queue}" (job "${spec.jobName}")`,
      );
    },
    async stop() {
      await worker.close();
      if (ownConnection && connection instanceof Redis) {
        await connection.quit().catch(() => undefined);
      }
    },
  };
}

export type ExpiryHandler = (payload: CreditExpiryPayload) => Promise<void>;
export type WarrantyHandler = (payload: WarrantyExpiryPayload) => Promise<void>;
export type BalanceRecheckHandler = (
  payload: BalanceRecheckPayload,
) => Promise<void>;
export type CashbackClaimDeadlineHandler = (
  payload: CashbackClaimDeadlinePayload,
) => Promise<void>;

export type BullmqExpiryOptions = PushJobWorkerOptions<CreditExpiryPayload>;

/** BullMQ consumer wired to Redis via `REDIS_URL`. Connects on `start()`; a
 * live Redis is required to actually drain jobs (see consumer.test.ts). */
export function createBullmqExpiryWorker(
  options: BullmqExpiryOptions = {},
): ExpiryWorkerConsumer & { readonly worker: Worker<CreditExpiryPayload> } {
  return createPushJobWorker(
    {
      queue: CREDIT_EXPIRY_QUEUE,
      jobName: CREDIT_EXPIRY_JOB,
      label: "expiry",
      concurrencyEnv: "EXPIRY_CONCURRENCY",
      process: (payload, db) => processExpiry(payload, db),
    },
    options,
  );
}

export interface MemoryExpiryOptions {
  autoProcess?: boolean;
}

/** In-memory consumer for tests / local dev — mirrors the worker-ingest
 * scaffold so the queue contract can be asserted without a live Redis. */
export function createMemoryExpiryWorker(
  handler: ExpiryHandler,
  options: MemoryExpiryOptions = {},
): ExpiryWorkerConsumer & {
  readonly queue: string;
  enqueue(payload: CreditExpiryPayload, delayMs?: number): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const pending: Array<{
    payload: CreditExpiryPayload;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];

  return {
    queue: CREDIT_EXPIRY_QUEUE,
    async start() {},
    async stop() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      pending.length = 0;
    },
    async enqueue(payload, delayMs = 0) {
      const entry: {
        payload: CreditExpiryPayload;
        timer?: ReturnType<typeof setTimeout>;
      } = { payload };
      pending.push(entry);
      if (!autoProcess) return;
      entry.timer = setTimeout(() => {
        void handler(payload).catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      for (const entry of pending) {
        await handler(entry.payload);
      }
      pending.length = 0;
    },
  };
}

export {
  CREDIT_EXPIRY_QUEUE,
  CREDIT_EXPIRY_JOB,
} from "./queues.js";
export { processExpiry, CREDIT_EXPIRY_EVENT } from "./handler.js";
export type { CreditExpiryPayload } from "./queues.js";

export type BullmqWarrantyOptions = PushJobWorkerOptions<WarrantyExpiryPayload>;

/** BullMQ consumer for the warranty-expiry queue. Mirrors the credit worker. */
export function createBullmqWarrantyWorker(
  options: BullmqWarrantyOptions = {},
): ExpiryWorkerConsumer & { readonly worker: Worker<WarrantyExpiryPayload> } {
  return createPushJobWorker(
    {
      queue: WARRANTY_EXPIRY_QUEUE,
      jobName: WARRANTY_EXPIRY_JOB,
      label: "warranty",
      concurrencyEnv: "EXPIRY_CONCURRENCY",
      process: (payload, db) => processWarrantyExpiry(payload, db),
    },
    options,
  );
}

/** In-memory warranty consumer for tests / local dev. */
export function createMemoryWarrantyWorker(
  handler: WarrantyHandler,
  options: MemoryExpiryOptions = {},
): ExpiryWorkerConsumer & {
  readonly queue: string;
  enqueue(payload: WarrantyExpiryPayload, delayMs?: number): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const pending: Array<{
    payload: WarrantyExpiryPayload;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];

  return {
    queue: WARRANTY_EXPIRY_QUEUE,
    async start() {},
    async stop() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      pending.length = 0;
    },
    async enqueue(payload, delayMs = 0) {
      const entry: {
        payload: WarrantyExpiryPayload;
        timer?: ReturnType<typeof setTimeout>;
      } = { payload };
      pending.push(entry);
      if (!autoProcess) return;
      entry.timer = setTimeout(() => {
        void handler(payload).catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      for (const entry of pending) {
        await handler(entry.payload);
      }
      pending.length = 0;
    },
  };
}

export {
  WARRANTY_EXPIRY_QUEUE,
  WARRANTY_EXPIRY_JOB,
} from "./queues.js";
export {
  processWarrantyExpiry,
  WARRANTY_EXPIRY_EVENT,
} from "./handler.js";
export type { WarrantyExpiryPayload } from "./queues.js";

export type BullmqBalanceRecheckOptions = PushJobWorkerOptions<BalanceRecheckPayload>;

/** BullMQ consumer for WV02 credit-balance-recheck nudges. */
export function createBullmqBalanceRecheckWorker(
  options: BullmqBalanceRecheckOptions = {},
): ExpiryWorkerConsumer & {
  readonly worker: Worker<BalanceRecheckPayload>;
} {
  return createPushJobWorker(
    {
      queue: BALANCE_RECHECK_QUEUE,
      jobName: BALANCE_RECHECK_JOB,
      label: "balance-recheck",
      concurrencyEnv: "BALANCE_RECHECK_CONCURRENCY",
      process: (payload, db) => processBalanceRecheck(payload, db),
    },
    options,
  );
}

/** In-memory balance-recheck consumer for tests / local dev. */
export function createMemoryBalanceRecheckWorker(
  handler: BalanceRecheckHandler,
  options: MemoryExpiryOptions = {},
): ExpiryWorkerConsumer & {
  readonly queue: string;
  enqueue(payload: BalanceRecheckPayload, delayMs?: number): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const pending: Array<{
    payload: BalanceRecheckPayload;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];

  return {
    queue: BALANCE_RECHECK_QUEUE,
    async start() {},
    async stop() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      pending.length = 0;
    },
    async enqueue(payload, delayMs = 0) {
      const entry: {
        payload: BalanceRecheckPayload;
        timer?: ReturnType<typeof setTimeout>;
      } = { payload };
      pending.push(entry);
      if (!autoProcess) return;
      entry.timer = setTimeout(() => {
        void handler(payload).catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      for (const entry of pending) {
        await handler(entry.payload);
      }
      pending.length = 0;
    },
  };
}

export {
  BALANCE_RECHECK_QUEUE,
  BALANCE_RECHECK_JOB,
} from "./queues.js";
export {
  processBalanceRecheck,
  BALANCE_RECHECK_EVENT,
} from "./handler.js";
export type { BalanceRecheckPayload } from "./queues.js";

export type BullmqCashbackClaimOptions = PushJobWorkerOptions<CashbackClaimDeadlinePayload>;

/** BullMQ consumer for U006 cashback-claim-deadline T-3d nudges. */
export function createBullmqCashbackClaimWorker(
  options: BullmqCashbackClaimOptions = {},
): ExpiryWorkerConsumer & {
  readonly worker: Worker<CashbackClaimDeadlinePayload>;
} {
  // The result used to be ignored: quiet hours and failed sends completed the job.
  return createPushJobWorker(
    {
      queue: CASHBACK_CLAIM_QUEUE,
      jobName: CASHBACK_CLAIM_JOB,
      label: "cashback-claim",
      concurrencyEnv: "CASHBACK_CLAIM_CONCURRENCY",
      process: (payload, db) => processCashbackClaimDeadline(payload, db),
    },
    options,
  );
}

/** In-memory cashback-claim consumer for tests / local dev. */
export function createMemoryCashbackClaimWorker(
  handler: CashbackClaimDeadlineHandler,
  options: MemoryExpiryOptions = {},
): ExpiryWorkerConsumer & {
  readonly queue: string;
  enqueue(
    payload: CashbackClaimDeadlinePayload,
    delayMs?: number,
  ): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const pending: Array<{
    payload: CashbackClaimDeadlinePayload;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];

  return {
    queue: CASHBACK_CLAIM_QUEUE,
    async start() {},
    async stop() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      pending.length = 0;
    },
    async enqueue(payload, delayMs = 0) {
      const entry: {
        payload: CashbackClaimDeadlinePayload;
        timer?: ReturnType<typeof setTimeout>;
      } = { payload };
      pending.push(entry);
      if (!autoProcess) return;
      entry.timer = setTimeout(() => {
        void handler(payload).catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      for (const entry of pending) {
        await handler(entry.payload);
      }
      pending.length = 0;
    },
  };
}

export {
  CASHBACK_CLAIM_QUEUE,
  CASHBACK_CLAIM_JOB,
} from "./queues.js";
export {
  processCashbackClaimDeadline,
  CASHBACK_CLAIM_DEADLINE_EVENT,
} from "./handler.js";
export type { CashbackClaimDeadlinePayload } from "./queues.js";
