import type { DeliveredRenderJob, RenderProcessingJob } from "./types.js";

export type { DeliveredRenderJob, RenderProcessingJob };

export type RenderJobHandler = (job: RenderProcessingJob) => Promise<void>;
export type DeliveredRenderHandler = (job: DeliveredRenderJob) => Promise<void>;

export type RenderWorkerConsumer = {
  start(): Promise<void>;
  stop(): Promise<void>;
  flush?(): Promise<void>;
};

export function createMemoryRenderWorker(
  handlers: {
    delivered: DeliveredRenderHandler;
    render: RenderJobHandler;
  },
  options: { autoProcess?: boolean } = {},
): RenderWorkerConsumer & {
  enqueueDelivered(job: DeliveredRenderJob): Promise<void>;
  enqueueRender(job: RenderProcessingJob): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const renderPending: RenderProcessingJob[] = [];

  return {
    async start() {},
    async stop() {
      renderPending.length = 0;
    },
    async enqueueDelivered(job) {
      if (!autoProcess) {
        await handlers.delivered(job);
        return;
      }
      setImmediate(() => {
        void handlers.delivered(job).catch(() => undefined);
      });
    },
    async enqueueRender(job) {
      renderPending.push(job);
      if (!autoProcess) return;
      setImmediate(() => {
        const next = renderPending.shift();
        if (next) void handlers.render(next).catch(() => undefined);
      });
    },
    async flush() {
      while (renderPending.length > 0) {
        const job = renderPending.shift()!;
        await handlers.render(job);
      }
    },
  };
}

/**
 * There is no BullMQ consumer for renders yet: they run in the API process
 * (apps/api/src/lib/jobs/queue.ts). Starting this fails rather than pretending to consume.
 */
export function createBullmqRenderWorker(_redisUrl?: string): RenderWorkerConsumer {
  return {
    async start() {
      throw new Error(
        "worker-render has no BullMQ consumer: renders run in the API process (apps/api/src/lib/jobs/queue.ts)",
      );
    },
    async stop() {},
  };
}
