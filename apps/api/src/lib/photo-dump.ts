/**
 * N55-PHOTO-DUMP — ingest a batch of closet photos into tagged wardrobe items.
 */
import {
  toPhotoDumpCreatePayload,
  type DuplicateWarning,
  type OwnedItemLike,
  type PhotoDumpPhoto,
} from "@worn/shared";
import type { Repositories, WardrobeItemRecord } from "./repositories/types.js";
import {
  createVisionTagClientFromEnv,
  tagImageWithDupes,
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
  const records: WardrobeItemRecord[] = [];
  let tagged = 0;

  for (const photo of input.photos) {
    const taggedResult = await tagImageWithDupes(
      client,
      {
        imageKey: photo.imageKey,
        labels: photo.labels,
        text: photo.text,
        titleHint: photo.titleHint,
      },
      owned,
    );
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
    const item = await repos.createWardrobeItem({
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
    records.push(item);
    owned.push({
      id: item.id,
      title: [item.brand, item.colors?.[0], item.category].filter(Boolean).join(" "),
      brand: item.brand ?? null,
      category: item.category ?? null,
    });
  }

  return { records, tagged, duplicateWarnings };
}
