/**
 * W070 / U040 — photo-dump batch review + triage (keep / wardrobe / discard).
 */

export {
  PHOTO_DUMP_TAG,
  PHOTO_DUMP_TRIAGE_KEEP,
  PHOTO_DUMP_TRIAGE_WARDROBE,
  PHOTO_DUMP_TRIAGE_DISCARD,
  PHOTO_DUMP_REVIEWED_TAG,
  triageDecisionFromTags,
  applyPhotoDumpTriageTags,
  undoPhotoDumpTriageTags,
  isPhotoDumpTriagePending,
  photoDumpTriageProgress,
  canUndoPhotoDumpTriage,
  type PhotoDumpTriageDecision,
  type PhotoDumpTriageProgress,
} from '@worn/shared';

import {
  applyPhotoDumpTriageTags,
  isPhotoDumpTriagePending,
  photoDumpTriageProgress,
  type PhotoDumpTriageDecision,
} from '@worn/shared';

export const PHOTO_DUMP_SORTED_TAG = 'sorted';

export type PhotoDumpItemLike = {
  id: string;
  category: string;
  brand?: string | null;
  tags?: string[] | null;
  garmentImageUrl?: string | null;
  imageUrls?: string[] | null;
};

/** Pending = dumped without triage decision. */
export function isPhotoDumpPending(item: PhotoDumpItemLike): boolean {
  return isPhotoDumpTriagePending(item.tags);
}

export function hasPhotoDumpTag(tags: string[] | null | undefined): boolean {
  return (tags ?? []).includes('photo-dump');
}

export function isPhotoDumpReviewed(tags: string[] | null | undefined): boolean {
  return hasPhotoDumpTag(tags) && !isPhotoDumpTriagePending(tags);
}

/** Legacy confirm = triage wardrobe. */
export function confirmPhotoDumpTags(existing: string[] | null | undefined): string[] {
  return applyPhotoDumpTriageTags(existing, 'wardrobe');
}

export function photoDumpReviewProgress(items: PhotoDumpItemLike[]) {
  return photoDumpTriageProgress(items);
}

export const TRIAGE_ACTIONS: Array<{ decision: PhotoDumpTriageDecision; label: string }> = [
  { decision: 'keep', label: 'Keep' },
  { decision: 'wardrobe', label: 'Wardrobe' },
  { decision: 'discard', label: 'Discard' },
];
