import { PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS, WardrobeDiscardPurgeJobSchema } from "@worn/shared";
import type { AppDeps } from "../lib/deps.js";

/** Queue name; payload `WardrobeDiscardPurgeJobSchema`. Producer: photo-dump triage "discard". */
export const WARDROBE_DISCARD_PURGE_QUEUE = "wardrobe-discard-purge";
/** Run a little after the undo window closes. */
export const WARDROBE_DISCARD_PURGE_DELAY_MS = PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS + 5_000;

/**
 * Delete a discarded item once its undo window has passed. Safe to run twice and a no-op when the
 * item was restored, re-discarded later (its newer purge job deletes it), or is already gone.
 */
export async function handleWardrobeDiscardPurge(data: unknown, deps: Pick<AppDeps, "repos">): Promise<void> {
  const job = WardrobeDiscardPurgeJobSchema.parse(data);
  await deps.repos.purgeDiscardedWardrobeItem(
    job.wardrobeItemId,
    job.userId,
    new Date(Date.now() - PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS),
  );
}
