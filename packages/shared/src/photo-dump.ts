/**
 * N55-PHOTO-DUMP — batch of closet photos → tagged wardrobe create payloads.
 * Pure helpers; vision tagging happens in the API layer.
 */

import type { DuplicateWarning } from "./schemas/dup-rebuy.js";
import type { VisionAutoTag } from "./wardrobe-autotag.js";

/** Acceptance batch size for concierge-lite photo dumps. */
export const PHOTO_DUMP_TARGET_BATCH = 20;

export type PhotoDumpTaggedInput = {
  imageKey: string;
  tag: VisionAutoTag;
  duplicateWarnings: DuplicateWarning[];
};

export type PhotoDumpCreatePayload = {
  source: "MANUAL";
  category: string;
  colors: string[];
  brand: string | null;
  costMinor: 0;
  imageKeys: string[];
  garmentImageKey: string;
  laundryStatus: "CLEAN";
  closetStatus: "ACTIVE";
  tags: string[];
  profileId?: string | null;
};

export function photoDumpTags(extra?: string[]): string[] {
  const base = ["photo-dump"];
  if (!extra?.length) return base;
  return [...base, ...extra.filter((t) => t && t !== "photo-dump")];
}

/** Map a vision tag + image key into a wardrobe create body (N55). */
export function toPhotoDumpCreatePayload(
  tagged: PhotoDumpTaggedInput,
  opts?: { profileId?: string | null; extraTags?: string[] },
): PhotoDumpCreatePayload {
  return {
    source: "MANUAL",
    category: tagged.tag.category || "other",
    colors: tagged.tag.colors ?? [],
    brand: tagged.tag.brand ?? null,
    costMinor: 0,
    imageKeys: [tagged.imageKey],
    garmentImageKey: tagged.imageKey,
    laundryStatus: "CLEAN",
    closetStatus: "ACTIVE",
    tags: photoDumpTags(opts?.extraTags),
    profileId: opts?.profileId ?? null,
  };
}

export function summarizePhotoDumpBatch(created: number, tagged: number) {
  return {
    created,
    tagged,
    meetsTargetBatch: created >= PHOTO_DUMP_TARGET_BATCH,
  };
}
