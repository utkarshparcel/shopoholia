import type { Repositories } from "../repositories/types.js";
import { scheduleOrderLadderJobs } from "./order-scheduler.js";
import type { AvatarProcessingJob } from "./avatar-processing.js";
import type { TryonProcessingJob } from "./tryon-processing.js";
import type { OrderTransitionJob } from "./order-processing.js";
import type { DeliveredRenderJob, RenderProcessingJob } from "./render-processing.js";

export type JobHandler<T> = (job: T) => Promise<void>;

export interface JobQueue {
  enqueueAvatarProcessing(job: AvatarProcessingJob): Promise<void>;
  enqueueTryonProcessing(job: TryonProcessingJob): Promise<void>;
  scheduleOrderLadder(orderId: string): Promise<void>;
  enqueueDeliveredRender(job: DeliveredRenderJob): Promise<void>;
  enqueueRender(job: RenderProcessingJob): Promise<void>;
  flushOrderTransitions?(): Promise<void>;
  flushRenderJobs?(): Promise<void>;
  drain?(): Promise<void>;
}

export type JobKind = "avatar" | "tryon" | "orderTransition" | "deliveredRender" | "render";

/** Gets failures of jobs run in the background, where no caller is waiting to catch them. */
export type JobErrorReporter = (
  error: unknown,
  job: { kind: JobKind; ids: Record<string, string> },
) => void;

export const logJobError: JobErrorReporter = (error, { kind, ids }) => {
  console.error(`[jobs] ${kind} job failed`, ids, error);
};

/** What identifies a job in error reports: its *Id fields, plus an order step's target state. */
function jobIds(job: object): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const [key, value] of Object.entries(job)) {
    if (typeof value === "string" && (key.endsWith("Id") || key === "targetState")) {
      ids[key] = value;
    }
  }
  return ids;
}

/** Renders run in the API process; FASHN calls take minutes, so only a few run at once. */
export const DEFAULT_RENDER_CONCURRENCY = 3;

/** Waits before each new attempt of a delivery step that failed (a passing database error…). */
export const ORDER_STEP_RETRY_DELAYS_MS: readonly number[] = [5_000, 30_000, 2 * 60_000, 10 * 60_000];

type QueueOptions = {
  autoProcess?: boolean;
  repos: Repositories;
  /** Defaults to console.error. */
  onError?: JobErrorReporter;
  /** How many render jobs run at once. Defaults to DEFAULT_RENDER_CONCURRENCY. */
  renderConcurrency?: number;
  /** Defaults to ORDER_STEP_RETRY_DELAYS_MS; its length is the number of retries. */
  orderStepRetryDelaysMs?: readonly number[];
};

export function createMemoryJobQueue(
  handlers: {
    avatar: JobHandler<AvatarProcessingJob>;
    tryon: JobHandler<TryonProcessingJob>;
    orderTransition: JobHandler<OrderTransitionJob>;
    deliveredRender: JobHandler<DeliveredRenderJob>;
    render: JobHandler<RenderProcessingJob>;
  },
  options: QueueOptions,
): JobQueue {
  const avatarPending: AvatarProcessingJob[] = [];
  const tryonPending: TryonProcessingJob[] = [];
  const renderPending: RenderProcessingJob[] = [];
  const autoProcess = options.autoProcess ?? true;
  const orderPending: Array<{
    job: OrderTransitionJob;
    timer?: ReturnType<typeof setTimeout>;
  }> = [];
  // Steps for one order run one at a time, in the order their timers fire, so steps
  // that come due together (e.g. overdue ones after a restart) can't race each other.
  const orderChains = new Map<string, Promise<void>>();
  const onError = options.onError ?? logJobError;
  const renderConcurrency = Math.max(1, options.renderConcurrency ?? DEFAULT_RENDER_CONCURRENCY);
  const orderStepRetryDelaysMs = options.orderStepRetryDelaysMs ?? ORDER_STEP_RETRY_DELAYS_MS;

  /**
   * Runs a job nobody awaits: a failure goes to the reporter, and the returned promise never
   * rejects. Resolves to whether the job succeeded.
   */
  const runJob = async <T extends object>(kind: JobKind, handler: JobHandler<T>, job: T) => {
    try {
      await handler(job);
      return true;
    } catch (error) {
      try {
        onError(error, { kind, ids: jobIds(job) });
      } catch {
        // A failing reporter must not change how the queue runs.
      }
      return false;
    }
  };

  const schedule = (fn: () => Promise<void>) => {
    if (autoProcess) {
      setImmediate(() => {
        void fn();
      });
    }
  };

  /**
   * A failed step is tried again after a while, a bounded number of times, so a passing error
   * doesn't leave the order stuck in its state (the step handler also catches up missed steps).
   */
  const runOrderTransition = (job: OrderTransitionJob, attempt = 0): Promise<void> => {
    const previous = orderChains.get(job.orderId) ?? Promise.resolve();
    const current = previous.then(async () => {
      const ok = await runJob("orderTransition", handlers.orderTransition, job);
      const delay = orderStepRetryDelaysMs[attempt];
      if (!ok && delay !== undefined) {
        setTimeout(() => {
          void runOrderTransition(job, attempt + 1);
        }, delay);
      }
    });
    orderChains.set(job.orderId, current);
    void current.then(() => {
      if (orderChains.get(job.orderId) === current) orderChains.delete(job.orderId);
    });
    return current;
  };

  const enqueueOrderTransition = async (job: OrderTransitionJob, delayMs: number) => {
    const entry: {
      job: OrderTransitionJob;
      timer?: ReturnType<typeof setTimeout>;
    } = { job };
    orderPending.push(entry);

    if (!autoProcess) return;

    entry.timer = setTimeout(() => {
      const index = orderPending.indexOf(entry);
      if (index >= 0) orderPending.splice(index, 1);
      void runOrderTransition(job);
    }, delayMs);
  };

  // Render jobs: at most `renderConcurrency` at once, and one job per render. A render queued
  // again while its job runs (a retry) runs once more after it.
  const renderActive = new Set<string>();
  const renderAgain = new Map<string, RenderProcessingJob>();
  const pumpRenders = () => {
    while (renderActive.size < renderConcurrency && renderPending.length > 0) {
      const job = renderPending.shift()!;
      renderActive.add(job.renderId);
      void runJob("render", handlers.render, job).then(() => {
        renderActive.delete(job.renderId);
        const again = renderAgain.get(job.renderId);
        if (again) {
          renderAgain.delete(job.renderId);
          renderPending.push(again);
        }
        pumpRenders();
      });
    }
  };

  const queue: JobQueue = {
    async enqueueAvatarProcessing(job) {
      avatarPending.push(job);
      schedule(async () => {
        const next = avatarPending.shift();
        if (next) await runJob("avatar", handlers.avatar, next);
      });
    },
    async enqueueTryonProcessing(job) {
      tryonPending.push(job);
      schedule(async () => {
        const next = tryonPending.shift();
        if (next) await runJob("tryon", handlers.tryon, next);
      });
    },
    async scheduleOrderLadder(orderId) {
      await scheduleOrderLadderJobs(options.repos, orderId, enqueueOrderTransition);
    },
    async enqueueDeliveredRender(job) {
      if (autoProcess) {
        schedule(async () => {
          await runJob("deliveredRender", handlers.deliveredRender, job);
        });
        return;
      }
      await handlers.deliveredRender(job);
    },
    async enqueueRender(job) {
      if (renderPending.some((pending) => pending.renderId === job.renderId)) return;
      if (renderActive.has(job.renderId)) {
        renderAgain.set(job.renderId, job);
        return;
      }
      renderPending.push(job);
      schedule(async () => pumpRenders());
    },
    async flushOrderTransitions() {
      for (const entry of orderPending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      for (const entry of orderPending) {
        await handlers.orderTransition(entry.job);
      }
      orderPending.length = 0;
    },
    /** Runs every queued render now, one at a time (tests, with autoProcess off). */
    async flushRenderJobs() {
      while (renderPending.length > 0) {
        const job = renderPending.shift()!;
        await runJob("render", handlers.render, job);
      }
    },
    async drain() {
      while (avatarPending.length > 0) {
        const job = avatarPending.shift()!;
        await handlers.avatar(job);
      }
      while (tryonPending.length > 0) {
        const job = tryonPending.shift()!;
        await handlers.tryon(job);
      }
      await queue.flushOrderTransitions!();
      await queue.flushRenderJobs!();
    },
  };

  return queue;
}
