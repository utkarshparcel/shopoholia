import type { RenderProvider } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import {
  enqueueFreeRendersForOrder,
  processRenderJob,
} from "../render/pipeline.js";
import type { PushService } from "../push/stub.js";
import type { StorageClient } from "../storage/r2.js";

export type RenderProcessingJob = {
  renderId: string;
  orderId: string;
};

export type DeliveredRenderJob = {
  orderId: string;
};

export function createRenderProcessingHandler(deps: {
  repos: Repositories;
  storage: StorageClient;
  renderProvider: RenderProvider;
  push: PushService;
}) {
  return async (job: RenderProcessingJob) => {
    await processRenderJob(deps, job.renderId, job.orderId);
  };
}

export function createDeliveredRenderHandler(deps: {
  repos: Repositories;
  enqueueRender: (job: RenderProcessingJob) => Promise<void>;
}) {
  return async (job: DeliveredRenderJob) => {
    await enqueueFreeRendersForOrder(deps.repos, job.orderId, async (renderId, orderId) => {
      await deps.enqueueRender({ renderId, orderId });
    });
  };
}
