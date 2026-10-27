import { WardrobeTryonJobSchema } from "@worn/shared";
import type { AppDeps } from "../lib/deps.js";
import { userObjectKey } from "../lib/storage/r2.js";

/** Queue name; payload `WardrobeTryonJobSchema`. Producer: POST /wardrobe/:id/tryon. */
export const WARDROBE_TRYON_QUEUE = "wardrobe-tryon";
/** A failed render may be asked for again after this long. */
export const RENDER_RETRY_AFTER_MS = 15 * 60_000;
/** A PROCESSING claim older than this is treated as lost and may be claimed again. */
export const RENDER_CLAIM_STALE_MS = 10 * 60_000;

export type RenderJobDeps = Pick<AppDeps, "repos" | "storage" | "renderProvider">;

/**
 * Render one claimed wardrobe try-on. Safe to run twice: it only acts on a PROCESSING row and
 * only a PROCESSING row can be finished. A provider failure is stored as FAILED with a
 * retryAfter; storage or database errors are thrown so the queue retries the job.
 */
export async function handleWardrobeTryon(data: unknown, deps: RenderJobDeps): Promise<void> {
  const job = WardrobeTryonJobSchema.parse(data);
  const preview = await deps.repos.findWardrobeTryonPreview(job.userId, job.wardrobeItemId);
  if (preview?.status !== "PROCESSING") return;

  const fail = (error: string) => failWardrobeTryonJob(job, deps, error);

  const item = await deps.repos.findWardrobeItem(job.wardrobeItemId, job.userId);
  const garmentImageKey = item?.garmentImageKey ?? item?.imageKeys[0] ?? null;
  if (!garmentImageKey) return fail("The item has no photo to try on");
  const avatar = await deps.repos.findAvatarByUserId(job.userId);
  if (!avatar?.referenceImageKey || avatar.status !== "READY") return fail("No ready avatar");

  let render;
  try {
    render = await deps.renderProvider.tryOn({ modelImageKey: avatar.referenceImageKey, garmentImageKey });
    if (!render.imageBytes || render.imageBytes.length === 0) throw new Error("Try-on returned no image");
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Try-on failed");
  }

  const { key } = await deps.storage.put({
    key: userObjectKey(job.userId, "tryon", `${job.wardrobeItemId}.jpg`),
    body: Buffer.from(render.imageBytes),
    contentType: "image/jpeg",
  });
  await deps.repos.finishWardrobeTryon(job.userId, job.wardrobeItemId, {
    status: "READY",
    imageKey: key,
    provider: deps.renderProvider.name,
    costMicros: render.costMicros,
  });
}

/**
 * For the worker once the queue has given up on a job (its last attempt threw): store FAILED so
 * the app stops waiting on PROCESSING. A no-op unless the row is still PROCESSING.
 */
export async function failWardrobeTryonJob(
  data: unknown,
  deps: Pick<AppDeps, "repos">,
  error: string,
): Promise<void> {
  const job = WardrobeTryonJobSchema.parse(data);
  await deps.repos.finishWardrobeTryon(job.userId, job.wardrobeItemId, {
    status: "FAILED",
    error: error.slice(0, 500),
    retryAfter: new Date(Date.now() + RENDER_RETRY_AFTER_MS),
  });
}
