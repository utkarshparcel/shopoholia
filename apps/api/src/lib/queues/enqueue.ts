import type { Queue } from "bullmq";

/**
 * BullMQ producer: one Queue per queue name per process, closed by `closeQueues` on app close.
 *
 * - REDIS_URL set: the job is added (default 3 attempts, exponential backoff from 1s). A failed or
 *   timed-out add throws QueueUnavailableError (503) in every environment.
 * - REDIS_URL missing: production throws QueueUnavailableError; elsewhere the job is skipped and
 *   the skip is logged once per queue.
 *
 * Pass a deterministic `jobId` (jobIdFrom) wherever the same work could be enqueued twice: BullMQ
 * keeps the first job with an id, so a retried request or a retried add after a timeout (which
 * may still land) can't run the work twice.
 */

export class QueueUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = "queue_unavailable";

  constructor(
    readonly queueName: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "QueueUnavailableError";
  }
}

export type EnqueueOptions = { jobId?: string; delay?: number; attempts?: number };
export type EnqueueResult = { status: "queued"; jobId: string } | { status: "skipped" };

const DEFAULT_ATTEMPTS = 3;
const BACKOFF = { type: "exponential", delay: 1_000 } as const;
/** How long an add may wait for Redis (connecting or slow) before it counts as failed. */
const ADD_TIMEOUT_MS = 5_000;
const ERROR_LOG_INTERVAL_MS = 60_000;

const queues = new Map<string, Promise<Queue>>();
const skippedLogged = new Set<string>();
/** One bullmq import per process (concurrent dynamic imports of a vi.mock'd module can resolve the real one). */
let bullmq: Promise<{ Queue: typeof Queue }> | undefined;

/** A BullMQ-safe id from `parts`: the same parts always give the same id, and it never has `:`. */
export function jobIdFrom(...parts: Array<string | number>): string {
  if (parts.length === 0) throw new RangeError("jobIdFrom needs at least one part");
  const id = parts
    .map((part) => {
      const s = String(part);
      if (s === "") throw new RangeError("jobIdFrom parts must be non-empty");
      // Escape the escape char, BullMQ's separator and ours, so distinct parts never collide.
      return s.replaceAll("%", "%25").replaceAll(":", "%3A").replaceAll("|", "%7C");
    })
    .join("|");
  assertJobId(id);
  return id;
}

/** BullMQ 5 rejects ids with `:` (outside its own 3-part form) and ids that read as integers. */
function assertJobId(id: string) {
  if (id.includes(":")) throw new RangeError(`jobId must not contain ":" (use jobIdFrom): ${id}`);
  if (`${parseInt(id, 10)}` === id) {
    throw new RangeError(`jobId must not be an integer; add a prefix part: ${id}`);
  }
}

function queueFor(queueName: string, url: string): Promise<Queue> {
  let queue = queues.get(queueName);
  if (!queue) {
    queue = (bullmq ??= import("bullmq")).then(({ Queue }) => {
      const q = new Queue(queueName, {
        // Fail fast while Redis is down instead of buffering commands without limit.
        connection: { url, enableOfflineQueue: false, connectTimeout: ADD_TIMEOUT_MS },
        defaultJobOptions: { attempts: DEFAULT_ATTEMPTS, backoff: BACKOFF },
      });
      // Without a listener an ioredis error would crash the process. Reconnects are automatic.
      let lastLoggedAt = 0;
      q.on("error", (err) => {
        const now = Date.now();
        if (now - lastLoggedAt < ERROR_LOG_INTERVAL_MS) return;
        lastLoggedAt = now;
        console.warn(`[queue] ${queueName}: Redis error`, String(err));
      });
      return q;
    });
    const created = queue;
    queues.set(queueName, created);
    // A failed import leaves nothing cached, so the next call tries again.
    created.catch(() => {
      bullmq = undefined;
      if (queues.get(queueName) === created) queues.delete(queueName);
    });
  }
  return queue;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function enqueueJob(
  queueName: string,
  jobName: string,
  data: unknown,
  options: EnqueueOptions = {},
): Promise<EnqueueResult> {
  if (options.jobId !== undefined) assertJobId(options.jobId);
  const url = process.env.REDIS_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new QueueUnavailableError(queueName, `REDIS_URL is not set; cannot enqueue ${jobName}`);
    }
    if (!skippedLogged.has(queueName)) {
      skippedLogged.add(queueName);
      console.warn(`[queue] REDIS_URL is not set: skipping ${queueName} jobs (not production)`);
    }
    return { status: "skipped" };
  }

  try {
    const queue = await queueFor(queueName, url);
    const job = (await withTimeout(
      queue.add(jobName, data, {
        ...(options.jobId !== undefined ? { jobId: options.jobId } : {}),
        ...(options.delay !== undefined ? { delay: Math.max(0, Math.round(options.delay)) } : {}),
        ...(options.attempts !== undefined ? { attempts: options.attempts } : {}),
      }),
      ADD_TIMEOUT_MS,
    )) as { id?: string };
    return { status: "queued", jobId: String(job.id) };
  } catch (err) {
    throw new QueueUnavailableError(queueName, `could not enqueue ${jobName} on ${queueName}`, {
      cause: err,
    });
  }
}

/** Close every cached Queue (app onClose). Later enqueueJob calls open new ones. */
export async function closeQueues(): Promise<void> {
  const open = [...queues.values()];
  queues.clear();
  await Promise.allSettled(open.map(async (queue) => (await queue).close()));
}
