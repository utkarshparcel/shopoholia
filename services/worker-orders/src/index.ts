import type { OrderState } from "@worn/shared";

export type OrderTransitionJob = {
  orderId: string;
  targetState: OrderState;
};

export type OrderTransitionHandler = (job: OrderTransitionJob) => Promise<void>;

export type OrderWorkerConsumer = {
  start(): Promise<void>;
  stop(): Promise<void>;
  flush?(): Promise<void>;
};

export function createMemoryOrderWorker(
  handler: OrderTransitionHandler,
  options: { autoProcess?: boolean } = {},
): OrderWorkerConsumer & {
  enqueue(job: OrderTransitionJob, delayMs: number): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const pending: Array<{ job: OrderTransitionJob; timer?: ReturnType<typeof setTimeout> }> = [];

  return {
    async start() {},
    async stop() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      pending.length = 0;
    },
    async enqueue(job, delayMs) {
      const entry: {
        job: OrderTransitionJob;
        timer?: ReturnType<typeof setTimeout>;
      } = { job };
      pending.push(entry);
      if (!autoProcess) return;
      entry.timer = setTimeout(() => {
        void handler(job).catch(() => undefined);
      }, delayMs);
    },
    async flush() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      for (const entry of pending) {
        await handler(entry.job);
      }
      pending.length = 0;
    },
  };
}

/**
 * There is no BullMQ consumer for order transitions yet: they run in the API process
 * (apps/api/src/lib/jobs/queue.ts). Starting this fails rather than pretending to consume.
 */
export function createBullmqOrderWorker(_redisUrl?: string): OrderWorkerConsumer {
  return {
    async start() {
      throw new Error(
        "worker-orders has no BullMQ consumer: order transitions run in the API process (apps/api/src/lib/jobs/queue.ts)",
      );
    },
    async stop() {},
  };
}
