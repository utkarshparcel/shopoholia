import { FitPreviewJobSchema } from "@worn/shared";
import type { AppDeps } from "../lib/deps.js";
import { userObjectKey } from "../lib/storage/r2.js";
import { RENDER_RETRY_AFTER_MS, type RenderJobDeps } from "./wardrobe-tryon.js";

/** Queue name; payload `FitPreviewJobSchema`. Producer: POST /fit/preview. */
export const FIT_PREVIEW_QUEUE = "fit-preview";

/** Render one claimed fit preview. Same rules as handleWardrobeTryon. */
export async function handleFitPreview(data: unknown, deps: RenderJobDeps): Promise<void> {
  const job = FitPreviewJobSchema.parse(data);
  const preview = await deps.repos.findFitPreview(job.previewId, job.userId);
  if (preview?.status !== "PROCESSING") return;

  const fail = (error: string) => failFitPreviewJob(job, deps, error);

  const avatar = await deps.repos.findAvatarByUserId(job.userId);
  if (!avatar?.referenceImageKey || avatar.status !== "READY") return fail("No ready avatar");

  let render;
  try {
    render = await deps.renderProvider.tryOn({
      modelImageKey: avatar.referenceImageKey,
      garmentImageKey: preview.garmentKey,
    });
    if (!render.imageBytes || render.imageBytes.length === 0) throw new Error("Preview returned no image");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Preview failed");
  }

  const { key } = await deps.storage.put({
    key: userObjectKey(job.userId, "fit-preview", `${job.previewId}.jpg`),
    body: Buffer.from(render.imageBytes),
    contentType: "image/jpeg",
  });
  await deps.repos.finishFitPreview(job.previewId, job.userId, {
    status: "READY",
    imageKey: key,
    provider: deps.renderProvider.name,
    costMicros: render.costMicros,
  });
}

/** failWardrobeTryonJob for fit previews. */
export async function failFitPreviewJob(data: unknown, deps: Pick<AppDeps, "repos">, error: string): Promise<void> {
  const job = FitPreviewJobSchema.parse(data);
  await deps.repos.finishFitPreview(job.previewId, job.userId, {
    status: "FAILED",
    error: error.slice(0, 500),
    retryAfter: new Date(Date.now() + RENDER_RETRY_AFTER_MS),
  });
}
