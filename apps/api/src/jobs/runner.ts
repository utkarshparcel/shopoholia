import { DelayedError, Queue, UnrecoverableError, Worker } from "bullmq";
import {
  DEFAULT_JOB_ATTEMPTS,
  DEFAULT_JOB_BACKOFF,
  JOB_REMOVE_ON_COMPLETE,
  JOB_REMOVE_ON_FAIL,
  attachStalledDeadLetters,
  createJobProcessor,
  type DeadLetter,
} from "@worn/shared";
import type { z } from "zod";

/**
 * The worker runner: one BullMQ Worker per registered queue, each job validated, bounded in time
 * and dead-lettered to Postgres on its last failure (createJobProcessor), plus the Job Scheduler
 * for periodic jobs. What runs is the list in registry.ts.
 */

const CONNECTION_ALERT_INTERVAL_MS = 60_000;

/** One queue's consumer: its payload contract and its handler (C6: `async (data, deps) => void`). */
export type JobDefinition<D> = {
  queue: string;
  schema: z.ZodType<unknown, z.ZodTypeDef, unknown>;
  handle: (data: unknown, deps: D) => Promise<void>;
  /** Jobs of this queue run at once in one process (default 1). */
  concurrency?: number;
  timeoutMs?: number;
  /** After the last attempt failed: settle the job's row (raw payload, error message). */
  onFinalFailure?: (data: unknown, deps: D, error: string) => Promise<void>;
};

export function defineJob<T, D>(definition: {
  queue: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  handle: (data: T, deps: D) => Promise<void>;
  concurrency?: number;
  timeoutMs?: number;
  onFinalFailure?: (data: unknown, deps: D, error: string) => Promise<void>;
}): JobDefinition<D> {
  // createJobProcessor parses `data` with `schema` before the handler sees it.
  return { ...definition, handle: (data, deps) => definition.handle(data as T, deps) };
}

/** A periodic job, kept in Redis by BullMQ's Job Scheduler (one per id, upserted at boot). */
export type JobSchedule = {
  id: string;
  queue: string;
  jobName: string;
  /** Cron pattern on the wall clock of `tz`. */
  pattern: string;
  tz: string;
  data?: Record<string, unknown>;
};

export type JobRunnerAlert = (
  message: string,
  context: Record<string, unknown>,
  error?: unknown,
) => void;

export type JobRunnerOptions<D> = {
  redisUrl: string;
  handlers: JobDefinition<D>[];
  schedules: JobSchedule[];
  deps: D;
  /** Durable copy of a final failure (job_dead_letters). */
  recordDeadLetter: (entry: DeadLetter) => Promise<void>;
  /** A job failed for good, a dead letter could not be written, or a worker lost Redis. */
  alert: JobRunnerAlert;
  info?: (message: string, context: Record<string, unknown>) => void;
};

export type JobRunner = {
  queues: string[];
  close(): Promise<void>;
};

/** Throws on a queue registered twice, a schedule without a handler, or a repeated schedule id. */
export function validateJobRegistry<D>(handlers: JobDefinition<D>[], schedules: JobSchedule[]): void {
  const queues = new Set<string>();
  for (const handler of handlers) {
    if (queues.has(handler.queue)) throw new Error(`job queue "${handler.queue}" is registered twice`);
    queues.add(handler.queue);
  }
  const ids = new Set<string>();
  for (const schedule of schedules) {
    if (!queues.has(schedule.queue)) {
      throw new Error(`schedule "${schedule.id}" is for queue "${schedule.queue}", which has no handler`);
    }
    if (ids.has(schedule.id)) throw new Error(`schedule id "${schedule.id}" is used twice`);
    ids.add(schedule.id);
  }
}

/** Upserts every schedule and removes schedulers that are no longer in the list, per queue. */
export async function syncJobSchedules(
  queues: Map<string, Queue>,
  schedules: JobSchedule[],
): Promise<{ upserted: string[]; removed: string[] }> {
  const upserted: string[] = [];
  const removed: string[] = [];
  for (const [name, queue] of queues) {
    const wanted = schedules.filter((schedule) => schedule.queue === name);
    const wantedIds = new Set(wanted.map((schedule) => schedule.id));
    for (const existing of await queue.getJobSchedulers(0, -1)) {
      if (!wantedIds.has(existing.key)) {
        await queue.removeJobScheduler(existing.key);
        removed.push(`${name}/${existing.key}`);
      }
    }
    for (const schedule of wanted) {
      await queue.upsertJobScheduler(
        schedule.id,
        { pattern: schedule.pattern, tz: schedule.tz },
        {
          name: schedule.jobName,
          data: schedule.data ?? {},
          opts: { attempts: DEFAULT_JOB_ATTEMPTS, backoff: DEFAULT_JOB_BACKOFF },
        },
      );
      upserted.push(`${name}/${schedule.id}`);
    }
  }
  return { upserted, removed };
}

export async function startJobRunner<D>(options: JobRunnerOptions<D>): Promise<JobRunner> {
  validateJobRegistry(options.handlers, options.schedules);
  // Workers block on Redis: ioredis must not give up on a command (BullMQ requires null here).
  const connection = { url: options.redisUrl, maxRetriesPerRequest: null };
  const queues = new Map<string, Queue>();
  const workers: Worker[] = [];

  const close = async () => {
    // Worker.close waits for the jobs in flight; an unfinished one is picked up again later.
    await Promise.allSettled(workers.map((worker) => worker.close()));
    await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
  };

  // ioredis reports every failed reconnect: one alert per queue per minute is enough.
  const lastConnectionAlert = new Map<string, number>();
  const alertConnection = (message: string, queue: string, error: unknown) => {
    const now = Date.now();
    const key = `${message}:${queue}`;
    if (now - (lastConnectionAlert.get(key) ?? 0) < CONNECTION_ALERT_INTERVAL_MS) return;
    lastConnectionAlert.set(key, now);
    options.alert(message, { queue }, error);
  };

  const alertDeadLetter = (entry: DeadLetter, error: unknown) =>
    options.alert(
      "job failed for good",
      { queue: entry.queue, jobId: entry.jobId, jobName: entry.jobName, attemptsMade: entry.attemptsMade },
      error,
    );

  try {
    for (const definition of options.handlers) {
      const queue = new Queue(definition.queue, { connection });
      queue.on("error", (err) => alertConnection("queue error", definition.queue, err));
      queues.set(definition.queue, queue);

      const settle = definition.onFinalFailure;
      const onFinalFailure = settle
        ? (data: unknown, error: string) => settle(data, options.deps, error)
        : undefined;
      const processor = createJobProcessor({
        queue: definition.queue,
        schema: definition.schema,
        handle: (data) => definition.handle(data, options.deps),
        timeoutMs: definition.timeoutMs,
        recordDeadLetter: options.recordDeadLetter,
        onDeadLetter: alertDeadLetter,
        onFinalFailure,
        errors: { DelayedError, UnrecoverableError },
      });
      const worker = new Worker(definition.queue, processor, {
        connection,
        concurrency: definition.concurrency ?? 1,
        removeOnComplete: JOB_REMOVE_ON_COMPLETE,
        removeOnFail: JOB_REMOVE_ON_FAIL,
      });
      worker.on("error", (err) => alertConnection("worker error", definition.queue, err));
      worker.on("stalled", (jobId) =>
        options.info?.("job stalled; BullMQ runs it again", { queue: definition.queue, jobId }),
      );
      attachStalledDeadLetters(worker, {
        queue: definition.queue,
        recordDeadLetter: options.recordDeadLetter,
        onDeadLetter: alertDeadLetter,
        onFinalFailure,
      });
      workers.push(worker);
    }

    const synced = await syncJobSchedules(queues, options.schedules);
    options.info?.("job runner started", { queues: [...queues.keys()], ...synced });
  } catch (err) {
    await close();
    throw err;
  }

  return { queues: [...queues.keys()], close };
}
