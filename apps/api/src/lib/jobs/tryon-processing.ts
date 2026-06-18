import type { RenderProvider } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";

export type TryonProcessingJob = {
  jobId: string;
  userId: string;
  listingVariantId: string;
  modelImageKey: string;
  garmentImageKey: string;
};

export function createTryonProcessingHandler(deps: {
  repos: Repositories;
  storage: StorageClient;
  renderProvider: RenderProvider;
}) {
  return async (job: TryonProcessingJob) => {
    try {
      const result = await deps.renderProvider.tryOn({
        modelImageKey: job.modelImageKey,
        garmentImageKey: job.garmentImageKey,
      });

      await deps.storage.put({
        key: result.imageKey,
        body: Buffer.from("mock-tryon-preview"),
        contentType: "image/jpeg",
      });

      await deps.repos.upsertTryonPreview({
        userId: job.userId,
        listingVariantId: job.listingVariantId,
        imageKey: result.imageKey,
        status: "READY",
        provider: deps.renderProvider.name,
        costMicros: result.costMicros,
      });
    } catch {
      await deps.repos.upsertTryonPreview({
        userId: job.userId,
        listingVariantId: job.listingVariantId,
        imageKey: null,
        status: "PROCESSING",
        provider: deps.renderProvider.name,
        costMicros: 0,
      });
    }
  };
}
