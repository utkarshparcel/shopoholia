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
  type ProcessPushResult,
} from "@worn/shared";
import { captureNodeException, initNodeSentry } from "@worn/shared/node-sentry";
import {
  processFoundMoneyWaiting,
  processMonthlyDigest,
  processWeeklyDigest,
  type ClosetPushHandlerOpts,
} from "./handler.js";
import {
  FOUND_MONEY_WAITING_JOB,
  MONTHLY_DIGEST_JOB,
  NUDGE_QUEUE,
  WEEKLY_DIGEST_JOB,
  type FoundMoneyWaitingPayload,
  type MonthlyDigestPayload,
  type WeeklyDigestPayload,
} from "./queues.js";
import { recordJobDeadLetter, type Db } from "@worn/db";

export interface NudgeWorkerConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type NudgeJobPayload =
  | FoundMoneyWaitingPayload
  | WeeklyDigestPayload
  | MonthlyDigestPayload;

/** Runs one nudge job by its name; an unknown name can never succeed, so it is not retried. */
export async function processNudgeJob(
  name: string,
  payload: NudgeJobPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  switch (name) {
    case FOUND_MONEY_WAITING_JOB:
      return processFoundMoneyWaiting(payload as FoundMoneyWaitingPayload, db, opts);
    case WEEKLY_DIGEST_JOB:
      return processWeeklyDigest(payload as WeeklyDigestPayload, db, opts);
    case MONTHLY_DIGEST_JOB:
      return processMonthlyDigest(payload as MonthlyDigestPayload, db, opts);
    default:
      throw new UnrecoverableError(`unknown ${NUDGE_QUEUE} job "${name}"`);
  }
}

export function createBullmqNudgeWorker(
  options: {
    redisUrl?: string;
    connection?: Redis;
    db?: Db | null;
    handler?: (name: string, payload: NudgeJobPayload) => Promise<void>;
    /** Where final failures go; defaults to job_dead_letters in `db`. */
    recordDeadLetter?: (entry: DeadLetter) => Promise<void>;
    concurrency?: number;
  } = {},
): NudgeWorkerConsumer & { readonly worker: Worker<NudgeJobPayload> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error("REDIS_URL or an explicit connection is required for the nudge worker");
  }
  const db = options.db ?? null;
  // Without a Db every job would fail: refuse to start instead.
  if (!db && !(options.handler && options.recordDeadLetter)) {
    throw new Error("A Db is required for the nudge worker");
  }
  const recordDeadLetter =
    options.recordDeadLetter ?? (async (entry: DeadLetter) => void (await recordJobDeadLetter(db!, entry)));
  const own = !options.connection;
  const connection = options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  initNodeSentry({ worker: "nudge" });
  const onDeadLetter = deadLetterAlert((err, tags) => captureNodeException(err, { worker: "nudge", ...tags }));
  const worker = new Worker<NudgeJobPayload>(
    NUDGE_QUEUE,
    createJobProcessor<NudgeJobPayload>({
      queue: NUDGE_QUEUE,
      handle: async (payload, job) => {
        if (options.handler) return options.handler(job.name, payload);
        const createdAt = job.timestamp ? new Date(job.timestamp) : undefined;
        settlePushResult(NUDGE_QUEUE, await processNudgeJob(job.name, payload, db!, { createdAt }));
      },
      recordDeadLetter,
      onDeadLetter,
      errors: { DelayedError, UnrecoverableError },
    }),
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env.NUDGE_CONCURRENCY ?? 4),
      removeOnComplete: JOB_REMOVE_ON_COMPLETE,
      removeOnFail: JOB_REMOVE_ON_FAIL,
    },
  );
  worker.on("error", (err) => console.error("[worker-nudge] worker error:", err.message));
  attachStalledDeadLetters(worker, { queue: NUDGE_QUEUE, recordDeadLetter, onDeadLetter });

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
      if (own) await connection.quit().catch(() => undefined);
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
