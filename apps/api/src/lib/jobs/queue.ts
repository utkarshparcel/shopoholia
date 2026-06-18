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

type QueueOptions = {
  autoProcess?: boolean;
  repos: Repositories;
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

  const schedule = (fn: () => Promise<void>) => {
    if (autoProcess) {
      setImmediate(() => {
        void fn().catch(() => undefined);
      });
    }
  };

  const enqueueOrderTransition = async (job: OrderTransitionJob, delayMs: number) => {
    const entry: {
      job: OrderTransitionJob;
      timer?: ReturnType<typeof setTimeout>;
    } = { job };
    orderPending.push(entry);

    if (!autoProcess) return;

    entry.timer = setTimeout(() => {
      void handlers.orderTransition(job).catch(() => undefined);
    }, delayMs);
  };

  const runRender = async (job: RenderProcessingJob) => {
    await handlers.render(job);
  };

  const queue: JobQueue = {
    async enqueueAvatarProcessing(job) {
      avatarPending.push(job);
      schedule(async () => {
        const next = avatarPending.shift();
        if (next) await handlers.avatar(next);
      });
    },
    async enqueueTryonProcessing(job) {
      tryonPending.push(job);
      schedule(async () => {
        const next = tryonPending.shift();
        if (next) await handlers.tryon(next);
      });
    },
    async scheduleOrderLadder(orderId) {
      await scheduleOrderLadderJobs(options.repos, orderId, enqueueOrderTransition);
    },
    async enqueueDeliveredRender(job) {
      if (autoProcess) {
        schedule(() => handlers.deliveredRender(job));
        return;
      }
      await handlers.deliveredRender(job);
    },
    async enqueueRender(job) {
      renderPending.push(job);
      if (autoProcess) {
        schedule(async () => {
          const next = renderPending.shift();
          if (next) await runRender(next);
        });
        return;
      }
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
    async flushRenderJobs() {
      while (renderPending.length > 0) {
        const job = renderPending.shift()!;
        await runRender(job);
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
