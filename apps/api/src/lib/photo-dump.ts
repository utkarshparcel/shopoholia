/**
 * N55-PHOTO-DUMP — ingest a batch of closet photos into tagged wardrobe items.
 */
import { randomUUID } from "node:crypto";
import {
  toPhotoDumpCreatePayload,
  type DuplicateWarning,
  type OwnedItemLike,
  type PhotoDumpPhoto,
} from "@worn/shared";
import type { CreateWardrobeItemInput, Repositories, WardrobeItemRecord } from "./repositories/types.js";
import {
  createVisionTagClientFromEnv,
  resolvePlaceholderIds,
  tagBatch,
  withDuplicateCheck,
  type VisionTagClient,
} from "./wardrobe-vision.js";

export type PhotoDumpRunResult = {
  records: WardrobeItemRecord[];
  tagged: number;
  duplicateWarnings: DuplicateWarning[];
};

function ownedFromRecords(items: WardrobeItemRecord[]): OwnedItemLike[] {
  return items.map((i) => ({
    id: i.id,
    title: [i.brand, i.colors?.[0], i.category].filter(Boolean).join(" "),
    brand: i.brand ?? null,
    category: i.category ?? null,
  }));
}

export async function runPhotoDump(
  repos: Repositories,
  input: {
    userId: string;
    photos: PhotoDumpPhoto[];
    profileId?: string | null;
    extraTags?: string[];
    vision?: VisionTagClient;
  },
): Promise<PhotoDumpRunResult> {
  const client = input.vision ?? createVisionTagClientFromEnv();
  const existing = await repos.listWardrobeItems(input.userId);
  const owned = ownedFromRecords(existing);
  const duplicateWarnings: DuplicateWarning[] = [];
  const inputs: CreateWardrobeItemInput[] = [];
  const placeholders: string[] = [];
  let tagged = 0;

  // Provider calls run in parallel under one deadline; the duplicate check then runs in order so
  // each photo is also checked against the earlier photos of this dump.
  const visions = await tagBatch(
    client,
    input.photos.map((photo) => ({ imageKey: photo.imageKey, labels: photo.labels, text: photo.text })),
  );
  for (const [i, photo] of input.photos.entries()) {
    const taggedResult = withDuplicateCheck(visions[i]!, photo, owned);
    tagged += 1;
    for (const w of taggedResult.duplicateWarnings) {
      duplicateWarnings.push(w as DuplicateWarning);
    }
    const payload = toPhotoDumpCreatePayload(
      {
        imageKey: photo.imageKey,
        tag: {
          category: taggedResult.category,
          colors: taggedResult.colors,
          brand: taggedResult.brand,
          confidence: taggedResult.confidence,
          sourceLabels: taggedResult.sourceLabels,
        },
        duplicateWarnings: taggedResult.duplicateWarnings as DuplicateWarning[],
      },
      { profileId: input.profileId, extraTags: input.extraTags },
    );
    inputs.push({
      userId: input.userId,
      source: payload.source,
      category: payload.category,
      colors: payload.colors,
      brand: payload.brand,
      costMinor: payload.costMinor,
      imageKeys: payload.imageKeys,
      garmentImageKey: payload.garmentImageKey,
      purchaseItemId: null,
      laundryStatus: payload.laundryStatus,
      closetStatus: payload.closetStatus,
      tags: payload.tags,
      profileId: payload.profileId ?? null,
    });
    const placeholder = randomUUID();
    placeholders.push(placeholder);
    owned.push({
      id: placeholder,
      title: [payload.brand, payload.colors?.[0], payload.category].filter(Boolean).join(" "),
      brand: payload.brand ?? null,
      category: payload.category ?? null,
    });
  }

  // One transaction for the whole dump.
  const created = await repos.createWardrobeItems(inputs);
  const ids = new Map(placeholders.map((p, i) => [p, created[i]!.item.id]));
  return {
    records: created.map((c) => c.item),
    tagged,
    duplicateWarnings: resolvePlaceholderIds(duplicateWarnings, ids),
  };
}
