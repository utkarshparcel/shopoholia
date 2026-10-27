import { Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { Redis } from "ioredis";
import {
  attachBullmqFailureReporting,
  initNodeSentry,
} from "@worn/shared/node-sentry";
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
import type { Db } from "@worn/db";

export interface ExpiryWorkerConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type ExpiryHandler = (payload: CreditExpiryPayload) => Promise<void>;
export type WarrantyHandler = (payload: WarrantyExpiryPayload) => Promise<void>;
export type BalanceRecheckHandler = (
  payload: BalanceRecheckPayload,
) => Promise<void>;
export type CashbackClaimDeadlineHandler = (
  payload: CashbackClaimDeadlinePayload,
) => Promise<void>;

export interface BullmqExpiryOptions {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  handler?: ExpiryHandler;
  concurrency?: number;
}

/** BullMQ consumer wired to Redis via `REDIS_URL`. Connects on `start()`; a
 * live Redis is required to actually drain jobs (see consumer.test.ts). */
export function createBullmqExpiryWorker(
  options: BullmqExpiryOptions = {},
): ExpiryWorkerConsumer & { readonly worker: Worker<CreditExpiryPayload> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error(
      "REDIS_URL or an explicit connection is required for the BullMQ expiry worker",
    );
  }
  const ownConnection = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ??
    new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  const db = options.db ?? null;
  const handler: ExpiryHandler =
    options.handler ??
    (async (payload) => {
      if (!db) {
        throw new Error("A Db is required to process expiry reminders");
      }
      await processExpiry(payload, db);
    });

  const worker = new Worker<CreditExpiryPayload>(
    CREDIT_EXPIRY_QUEUE,
    async (job, token) => {
      if (options.handler) {
        await handler(job.data);
        return;
      }
      if (!db) {
        throw new Error("A Db is required to process expiry reminders");
      }
      const result = await processExpiry(job.data, db);
      if (result.status === "delayed" && token) {
        await job.moveToDelayed(Date.now() + result.delayMs, token);
      }
    },
    {
      connection,
      concurrency:
        options.concurrency ?? Number(process.env.EXPIRY_CONCURRENCY ?? 4),
    },
  );

  initNodeSentry({ worker: "expiry" });
  attachBullmqFailureReporting(worker, "expiry");

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(
        `[worker-expiry] BullMQ worker ready on queue "${CREDIT_EXPIRY_QUEUE}" (job "${CREDIT_EXPIRY_JOB}")`,
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

export interface BullmqWarrantyOptions {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  handler?: WarrantyHandler;
  concurrency?: number;
}

/** BullMQ consumer for the warranty-expiry queue. Mirrors the credit worker. */
export function createBullmqWarrantyWorker(
  options: BullmqWarrantyOptions = {},
): ExpiryWorkerConsumer & { readonly worker: Worker<WarrantyExpiryPayload> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error(
      "REDIS_URL or an explicit connection is required for the BullMQ warranty worker",
    );
  }
  const ownConnection = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ??
    new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  const db = options.db ?? null;
  const handler: WarrantyHandler =
    options.handler ??
    (async (payload) => {
      if (!db) {
        throw new Error("A Db is required to process warranty reminders");
      }
      await processWarrantyExpiry(payload, db);
    });

  const worker = new Worker<WarrantyExpiryPayload>(
    WARRANTY_EXPIRY_QUEUE,
    async (job, token) => {
      if (options.handler) {
        await handler(job.data);
        return;
      }
      if (!db) {
        throw new Error("A Db is required to process warranty reminders");
      }
      const result = await processWarrantyExpiry(job.data, db);
      if (result.status === "delayed" && token) {
        await job.moveToDelayed(Date.now() + result.delayMs, token);
      }
    },
    {
      connection,
      concurrency:
        options.concurrency ?? Number(process.env.EXPIRY_CONCURRENCY ?? 4),
    },
  );

  initNodeSentry({ worker: "expiry" });
  attachBullmqFailureReporting(worker, "warranty-expiry");

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(
        `[worker-expiry] BullMQ worker ready on queue "${WARRANTY_EXPIRY_QUEUE}" (job "${WARRANTY_EXPIRY_JOB}")`,
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

export interface BullmqBalanceRecheckOptions {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  handler?: BalanceRecheckHandler;
  concurrency?: number;
}

/** BullMQ consumer for WV02 credit-balance-recheck nudges. */
export function createBullmqBalanceRecheckWorker(
  options: BullmqBalanceRecheckOptions = {},
): ExpiryWorkerConsumer & {
  readonly worker: Worker<BalanceRecheckPayload>;
} {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error(
      "REDIS_URL or an explicit connection is required for the BullMQ balance-recheck worker",
    );
  }
  const ownConnection = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ??
    new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  const db = options.db ?? null;
  const handler: BalanceRecheckHandler =
    options.handler ??
    (async (payload) => {
      if (!db) {
        throw new Error("A Db is required to process balance recheck reminders");
      }
      await processBalanceRecheck(payload, db);
    });

  const worker = new Worker<BalanceRecheckPayload>(
    BALANCE_RECHECK_QUEUE,
    async (job, token) => {
      if (options.handler) {
        await handler(job.data);
        return;
      }
      if (!db) {
        throw new Error("A Db is required to process balance recheck reminders");
      }
      const result = await processBalanceRecheck(job.data, db);
      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        result.status === "delayed" &&
        token
      ) {
        await job.moveToDelayed(Date.now() + result.delayMs, token);
      }
    },
    {
      connection,
      concurrency:
        options.concurrency ??
        Number(process.env.BALANCE_RECHECK_CONCURRENCY ?? 4),
    },
  );

  initNodeSentry({ worker: "expiry" });
  attachBullmqFailureReporting(worker, "credit-balance-recheck");

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(
        `[worker-expiry] BullMQ worker ready on queue "${BALANCE_RECHECK_QUEUE}" (job "${BALANCE_RECHECK_JOB}")`,
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

export interface BullmqCashbackClaimOptions {
  redisUrl?: string;
  connection?: Redis;
  db?: Db | null;
  handler?: CashbackClaimDeadlineHandler;
  concurrency?: number;
}

/** BullMQ consumer for U006 cashback-claim-deadline T-3d nudges. */
export function createBullmqCashbackClaimWorker(
  options: BullmqCashbackClaimOptions = {},
): ExpiryWorkerConsumer & {
  readonly worker: Worker<CashbackClaimDeadlinePayload>;
} {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error(
      "REDIS_URL or an explicit connection is required for the BullMQ cashback-claim worker",
    );
  }
  const ownConnection = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ??
    new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  const db = options.db ?? null;
  const handler: CashbackClaimDeadlineHandler =
    options.handler ??
    (async (payload) => {
      if (!db) {
        throw new Error("A Db is required to process cashback claim reminders");
      }
      await processCashbackClaimDeadline(payload, db);
    });

  const worker = new Worker<CashbackClaimDeadlinePayload>(
    CASHBACK_CLAIM_QUEUE,
    async (job) => {
      if (options.handler) {
        await handler(job.data);
        return;
      }
      if (!db) {
        throw new Error("A Db is required to process cashback claim reminders");
      }
      await processCashbackClaimDeadline(job.data, db);
    },
    {
      connection,
      concurrency:
        options.concurrency ??
        Number(process.env.CASHBACK_CLAIM_CONCURRENCY ?? 4),
    },
  );

  initNodeSentry({ worker: "expiry" });
  attachBullmqFailureReporting(worker, "cashback-claim-deadline");

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(
        `[worker-expiry] BullMQ worker ready on queue "${CASHBACK_CLAIM_QUEUE}" (job "${CASHBACK_CLAIM_JOB}")`,
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
