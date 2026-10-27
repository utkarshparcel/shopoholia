export const OUTFIT_QUEUE = "outfit-generation";
export const OUTFIT_JOB = "outfit-generate";
export const OUTFIT_MORNING_EVENT = "OUTFIT_READY";

export type OutfitPayload = {
  userId: string;
  trigger: "nightly" | "manual" | "morning";
  timeZone?: string;
};

/** Must match apps/api dry-clean-jobs schedule queue. */
export const DRY_CLEAN_QUEUE = "dry-clean-pickup";
export const DRY_CLEAN_JOB = "dry-clean-pickup-reminder";
export const DRY_CLEAN_PICKUP_EVENT = "DRY_CLEAN_PICKUP";

export type DryCleanPickupPayload = {
  userId: string;
  wardrobeItemId: string;
  ticket: string;
  pickupOn: string;
  category?: string;
  timeZone?: string;
};
