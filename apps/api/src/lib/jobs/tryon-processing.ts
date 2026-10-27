import type { RenderProvider } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import { userObjectKey, type StorageClient } from "../storage/r2.js";

export type TryonProcessingJob = {
  jobId: string;
  userId: string;
  listingVariantId: string;
  modelImageKey: string;
  garmentImageKey: string;
};

/** A failed render is not retried for this long. */
export const TRYON_RETRY_AFTER_MS = 15 * 60_000;

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
      if (!result.imageBytes || result.imageBytes.length === 0) {
        throw new Error("try-on returned no image");
      }

      // The stored bytes are the render itself, under the user's own key.
      const { key } = await deps.storage.put({
        key: userObjectKey(job.userId, "tryon", `v-${job.listingVariantId}.jpg`),
        body: Buffer.from(result.imageBytes),
        contentType: "image/jpeg",
      });

      await deps.repos.upsertTryonPreview({
        userId: job.userId,
        listingVariantId: job.listingVariantId,
        imageKey: key,
        status: "READY",
        provider: deps.renderProvider.name,
        costMicros: result.costMicros,
      });
    } catch (error) {
      // FAILED, not PROCESSING: a stuck PROCESSING row would answer 202 forever.
      await deps.repos.upsertTryonPreview({
        userId: job.userId,
        listingVariantId: job.listingVariantId,
        imageKey: null,
        status: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 500) : "try-on failed",
        retryAfter: new Date(Date.now() + TRYON_RETRY_AFTER_MS),
        provider: deps.renderProvider.name,
        costMicros: 0,
      });
      throw error;
    }
  };
}
