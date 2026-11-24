import { randomUUID } from "node:crypto";
import type { RenderProvider } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import type { StorageClient } from "../storage/r2.js";
import type { JobHandler } from "./queue.js";

export type AvatarProcessingJob = {
  jobId: string;
  userId: string;
  avatarId: string;
  uploadKeys: string[];
};

export function createAvatarProcessingHandler(deps: {
  repos: Repositories;
  storage: StorageClient;
  renderProvider: RenderProvider;
}): JobHandler<AvatarProcessingJob> {
  return async (job) => {
    try {
      const result = await deps.renderProvider.createAvatarReference({
        uploadKeys: job.uploadKeys,
      });

      // Only a provider that made a new image hands back bytes; otherwise the reference is one of
      // the uploads, stored as it is.
      if (result.imageBytes) {
        await deps.storage.put({
          key: result.referenceImageKey,
          body: Buffer.from(result.imageBytes),
          contentType: "image/jpeg",
        });
      }

      await deps.repos.upsertAvatar({
        id: job.avatarId,
        userId: job.userId,
        referenceImageKey: result.referenceImageKey,
        sourceUploadKeys: [],
        bodyMeta: result.bodyMeta,
        status: "READY",
      });

      await deps.repos.updateUser(job.userId, { avatarStatus: "READY" });
      // The photo the reference points at stays; DELETE /avatar removes it with the reference.
      const unused = job.uploadKeys.filter((key) => key !== result.referenceImageKey);
      if (unused.length > 0) await deps.storage.deleteMany(unused);
    } catch {
      await deps.repos.upsertAvatar({
        id: job.avatarId,
        userId: job.userId,
        referenceImageKey: null,
        sourceUploadKeys: job.uploadKeys,
        bodyMeta: {},
        status: "FAILED",
      });
      await deps.repos.updateUser(job.userId, { avatarStatus: "FAILED" });
    }
  };
}

export function newJobId() {
  return randomUUID();
}
