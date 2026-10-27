import { z } from "zod";
import type { ProcessPushResult } from "./push-delivery.js";

/**
 * Background-job contract shared by the API worker runner (apps/api/src/jobs) and services/*.
 * No bullmq import here: callers pass bullmq's DelayedError / UnrecoverableError in, so this
 * module stays usable from the mobile bundle's dependency graph.
 */

/** Same rules as apps/api enqueue.ts `jobIdFrom` (parity-tested): deterministic, never has `:`. */
export function jobIdFrom(...parts: Array<string | number>): string {
  if (parts.length === 0) throw new RangeError("jobIdFrom needs at least one part");
  const id = parts
    .map((part) => {
      const s = String(part);
      if (s === "") throw new RangeError("jobIdFrom parts must be non-empty");
      return s.replaceAll("%", "%25").replaceAll(":", "%3A").replaceAll("|", "%7C");
    })
    .join("|");
  if (`${parseInt(id, 10)}` === id) {
    throw new RangeError(`jobId must not be an integer; add a prefix part: ${id}`);
  }
  return id;
}

export const DEFAULT_JOB_ATTEMPTS = 3;
export const DEFAULT_JOB_BACKOFF = { type: "exponential", delay: 1_000 } as const;
/** Completed jobs stay a week (so a re-add with the same id within a week is still a no-op). */
export const JOB_REMOVE_ON_COMPLETE = { age: 7 * 86_400, count: 50_000 } as const;
/** Failed jobs stay 30 days in Redis; final failures are also copied to job_dead_letters. */
export const JOB_REMOVE_ON_FAIL = { age: 30 * 86_400 } as const;
/** Longest one attempt may run before it counts as failed. */
export const DEFAULT_JOB_TIMEOUT_MS = 60_000;

/** Thrown by a handler to run the same job again later without spending an attempt. */
export class DeferJobError extends Error {
  constructor(readonly delayMs: number) {
    super(`deferred ${delayMs}ms`);
    this.name = "DeferJobError";
  }
}

export function deferJob(delayMs: number): never {
  throw new DeferJobError(Math.max(100, Math.round(delayMs)));
}

/** A job that failed for good, as stored in job_dead_letters. */
export type DeadLetter = {
  queue: string;
  jobId: string;
  jobName: string;
  data: Record<string, unknown>;
  error: string;
  attemptsMade: number;
  failedAt: Date;
};

const ID_KEY = /(^id$|Id$|Ids$|Key$|On$|At$|^kind$|^trigger$|^occasion$|^category$|^state$|^status$|^step$|^provider$|^currency$|^eventType$)/;
const MAX_KEPT_STRING = 200;

/**
 * The part of a job payload that is safe to keep in a dead letter: ids, dates, enums, numbers
 * and booleans. Free text (titles, names, merchants, message bodies, OAuth codes) is dropped.
 */
export function deadLetterData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "number" || typeof value === "boolean") {
      kept[key] = value;
    } else if (ID_KEY.test(key)) {
      if (typeof value === "string" && value.length <= MAX_KEPT_STRING) kept[key] = value;
      else if (
        Array.isArray(value) &&
        value.length <= 50 &&
        value.every((v) => typeof v === "string" && v.length <= MAX_KEPT_STRING)
      ) {
        kept[key] = value;
      }
    }
  }
  return kept;
}

/** What createJobProcessor needs from a BullMQ Job. */
export type ProcessableJob = {
  id?: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  /** When the job was created (ms); unchanged by retries and delays. */
  timestamp?: number;
  opts: { attempts?: number };
  moveToDelayed(timestamp: number, token?: string): Promise<void>;
};

/** True when this failure is the job's last: no attempt left, or it can never succeed. */
export function isFinalAttempt(job: Pick<ProcessableJob, "attemptsMade" | "opts">, err: unknown): boolean {
  if (err instanceof Error && err.name === "UnrecoverableError") return true;
  const attempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= attempts;
}

export type JobProcessorOptions<T> = {
  queue: string;
  /** Payload contract: a payload that fails it is dead-lettered at once (no retries). */
  schema?: z.ZodType<T, z.ZodTypeDef, unknown>;
  handle: (data: T, job: ProcessableJob) => Promise<void>;
  timeoutMs?: number;
  /** Durable sink for final failures (Postgres job_dead_letters). */
  recordDeadLetter: (entry: DeadLetter) => Promise<void>;
  /** Alert for a final failure (Sentry). Also gets sink failures. */
  onDeadLetter?: (entry: DeadLetter, error: unknown) => void;
  /** bullmq's classes, passed in so this module needs no bullmq import. */
  errors: {
    DelayedError: new (message?: string) => Error;
    UnrecoverableError: new (message?: string) => Error;
  };
  now?: () => number;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Wraps a handler as a BullMQ processor: validates the payload, bounds each attempt in time,
 * turns DeferJobError into a delay that spends no attempt, and on the final failure writes a
 * dead letter (ids only) and raises an alert before BullMQ marks the job failed.
 */
export function createJobProcessor<T>(options: JobProcessorOptions<T>) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  return async (job: ProcessableJob, token?: string): Promise<void> => {
    try {
      let data: T;
      if (options.schema) {
        const parsed = options.schema.safeParse(job.data);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("; ");
          throw new options.errors.UnrecoverableError(`invalid ${options.queue} payload: ${issues}`);
        }
        data = parsed.data;
      } else {
        data = job.data as T;
      }
      await withTimeout(options.handle(data, job), timeoutMs, `${options.queue} job`);
    } catch (err) {
      if (err instanceof DeferJobError) {
        await job.moveToDelayed(now() + err.delayMs, token);
        throw new options.errors.DelayedError();
      }
      if (isFinalAttempt(job, err)) {
        const entry: DeadLetter = {
          queue: options.queue,
          jobId: String(job.id ?? "unknown"),
          jobName: job.name,
          data: deadLetterData(job.data),
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          attemptsMade: job.attemptsMade + 1,
          failedAt: new Date(now()),
        };
        try {
          await options.recordDeadLetter(entry);
        } catch (sinkErr) {
          // The job still fails (and stays in Redis' failed set); the alert says the copy is missing.
          options.onDeadLetter?.(entry, sinkErr);
        }
        options.onDeadLetter?.(entry, err);
      }
      throw err;
    }
  };
}

/** What a BullMQ worker's "failed" event passes for the job. */
export type FailedJob = {
  id?: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  finishedOn?: number;
  deferredFailure?: string;
};

/**
 * A job that stalled past maxStalledCount is failed by BullMQ without calling the processor, so
 * createJobProcessor never sees it: this writes its dead letter from the worker's "failed" event.
 */
export function attachStalledDeadLetters(
  worker: { on(event: "failed", listener: (job: FailedJob | undefined, err: Error) => void): unknown },
  options: Pick<JobProcessorOptions<unknown>, "queue" | "recordDeadLetter" | "onDeadLetter">,
): void {
  worker.on("failed", (job, err) => {
    if (!job?.deferredFailure) return;
    const entry: DeadLetter = {
      queue: options.queue,
      jobId: String(job.id ?? "unknown"),
      jobName: job.name,
      data: deadLetterData(job.data),
      error: `${err.name}: ${err.message}`,
      attemptsMade: job.attemptsMade,
      failedAt: new Date(job.finishedOn ?? Date.now()),
    };
    options
      .recordDeadLetter(entry)
      .catch((sinkErr: unknown) => options.onDeadLetter?.(entry, sinkErr))
      .finally(() => options.onDeadLetter?.(entry, err));
  });
}

/** onDeadLetter for a service worker: one log line with the ids, and the error to Sentry. */
export function deadLetterAlert(
  capture: (error: unknown, tags: Record<string, string>) => void,
): (entry: DeadLetter, error: unknown) => void {
  return (entry, error) => {
    console.error(
      `[${entry.queue}] job ${entry.jobId} (${entry.jobName}) failed for good after ${entry.attemptsMade} attempt(s):`,
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
    capture(error, { queue: entry.queue, job_id: entry.jobId, job_name: entry.jobName });
  };
}

/**
 * A push result as the job's outcome: quiet hours run the job again when they end (no attempt
 * spent); a failed send throws so BullMQ retries it (the FAILED row is sent again) and, after the
 * last attempt, dead-letters it. Skipped, sent and "no push token" (queued) complete the job.
 */
export function settlePushResult(queue: string, result: ProcessPushResult): void {
  if (result.status === "delayed") deferJob(result.delayMs);
  if (result.status === "failed") throw new Error(`${queue}: push delivery failed`);
}

// ---------------------------------------------------------------------------------------------
// Payload schemas for the queues the API runner consumes (C6). Producers keep their own types;
// these are the consumer-side contract, so extra fields are allowed (C9: optional fields only).
// ---------------------------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "expected an ISO date-time");

export const CalEventOutfitJobSchema = z.object({
  userId: z.string().min(1),
  eventId: z.string().nullable().optional(),
  title: z.string().max(500),
  occasion: z.string().min(1),
  plannedFor: isoDate,
  startAt: isoDateTime,
});
export type CalEventOutfitJob = z.infer<typeof CalEventOutfitJobSchema>;

export const CoolingOffReleaseJobSchema = z.object({
  userId: z.string().min(1),
  releaseAt: isoDateTime,
  category: z.string().nullable().optional(),
  cartFingerprint: z.string().min(1),
});
export type CoolingOffReleaseJob = z.infer<typeof CoolingOffReleaseJobSchema>;

export const EmiDueJobSchema = z.object({
  planId: z.string().min(1),
  userId: z.string().min(1),
  provider: z.string().min(1),
  merchant: z.string().nullable(),
  remainingMinor: z.number().int(),
  installmentMinor: z.number().int(),
  dueOn: isoDate,
  currency: z.string().min(1),
});
export type EmiDueJob = z.infer<typeof EmiDueJobSchema>;

export const InterviewKitReminderJobSchema = z.object({
  userId: z.string().min(1),
  kitId: z.string().min(1),
  name: z.string().max(500),
  kind: z.enum(["interview", "ceremony"]),
  eventAt: isoDateTime,
  /** Absent on jobs queued before it was added; the handler then matches on eventAt. */
  remindAt: isoDateTime.optional(),
  occasion: z.string().min(1),
});
export type InterviewKitReminderJob = z.infer<typeof InterviewKitReminderJobSchema>;

export const LentOverdueJobSchema = z.object({
  userId: z.string().min(1),
  wardrobeItemId: z.string().min(1),
  lentTo: z.string().max(200),
  dueOn: isoDate,
  category: z.string().optional(),
  timeZone: z.string().optional(),
});
export type LentOverdueJob = z.infer<typeof LentOverdueJobSchema>;

export const PriceDropNotifyJobSchema = z.object({
  userId: z.string().min(1),
  watchId: z.string().min(1),
  brand: z.string().min(1),
  listingId: z.string().min(1),
  listingTitle: z.string().max(500),
  watchedPriceMinor: z.number().int(),
  currentPriceMinor: z.number().int(),
});
export type PriceDropNotifyJob = z.infer<typeof PriceDropNotifyJobSchema>;

/** What services/worker-ingest puts on the ingest-dead-letter queue (ids only since this fix). */
export const IngestDeadLetterJobSchema = z.object({
  kind: z.enum(["EMAIL", "SMS", "RESYNC", "OAUTH", "UNKNOWN"]),
  sourceId: z.string().optional(),
  documentId: z.string().optional(),
  jobId: z.string().optional(),
  error: z.string(),
  attempts: z.number().int(),
  timestamp: isoDateTime,
});
export type IngestDeadLetterJob = z.infer<typeof IngestDeadLetterJobSchema>;

/** Scheduler template for the daily retention sweep (the run time comes from the scheduler). */
export const RetentionSweepJobSchema = z.object({}).passthrough();
export type RetentionSweepJob = z.infer<typeof RetentionSweepJobSchema>;
