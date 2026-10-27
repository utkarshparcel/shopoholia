/**
 * In-process Closet ops prefs (U032 laundry rules, U034 dismiss, U035 keep snooze, U036 CPW).
 * Memory-backed for tests; mirrors pattern used by declutter challenges.
 */

import {
  DEFAULT_CPW_THRESHOLD,
  DEFAULT_LAUNDRY_RULES,
  normalizeCpwThreshold,
  normalizeLaundryRules,
  type CpwThresholdPrefs,
  type LaundryRulesPrefs,
} from "@worn/shared";

const laundryRulesByUser = new Map<string, LaundryRulesPrefs>();
const cpwThresholdByUser = new Map<string, CpwThresholdPrefs>();
const missingLayerDismissed = new Map<string, Set<string>>();
const keepSnoozeByItem = new Map<string, { userId: string; until: string }>();
const measureMeta = new Map<
  string,
  { changeNote: string | null; previousId: string | null; familyId: string }
>();
const tailorPickupByOrder = new Map<
  string,
  { expectedPickupOn: string; nudgeSent: boolean }
>();
const photoDumpTriageAt = new Map<string, string>();
const lentWasteNotes = new Map<string, string[]>();

export function getLaundryRules(userId: string): LaundryRulesPrefs {
  return laundryRulesByUser.get(userId) ?? { ...DEFAULT_LAUNDRY_RULES };
}

export function setLaundryRules(
  userId: string,
  patch: Partial<LaundryRulesPrefs>,
): LaundryRulesPrefs {
  const next = normalizeLaundryRules({ ...getLaundryRules(userId), ...patch });
  laundryRulesByUser.set(userId, next);
  return next;
}

export function getCpwThreshold(userId: string): CpwThresholdPrefs {
  return cpwThresholdByUser.get(userId) ?? { ...DEFAULT_CPW_THRESHOLD };
}

export function setCpwThreshold(
  userId: string,
  patch: Partial<CpwThresholdPrefs>,
): CpwThresholdPrefs {
  const next = normalizeCpwThreshold({ ...getCpwThreshold(userId), ...patch });
  cpwThresholdByUser.set(userId, next);
  return next;
}

export function dismissMissingLayer(userId: string, gapId: string): string[] {
  const set = missingLayerDismissed.get(userId) ?? new Set<string>();
  set.add(gapId);
  missingLayerDismissed.set(userId, set);
  return [...set];
}

export function listDismissedMissingLayers(userId: string): string[] {
  return [...(missingLayerDismissed.get(userId) ?? [])];
}

export function setKeepSnooze(userId: string, wardrobeItemId: string, until: string): void {
  keepSnoozeByItem.set(wardrobeItemId, { userId, until });
}

export function getKeepSnooze(
  userId: string,
  wardrobeItemId: string,
): string | null {
  const row = keepSnoozeByItem.get(wardrobeItemId);
  if (!row || row.userId !== userId) return null;
  return row.until;
}

export function setMeasureMeta(
  profileId: string,
  meta: { changeNote: string | null; previousId: string | null; familyId: string },
): void {
  measureMeta.set(profileId, meta);
}

export function getMeasureMeta(profileId: string) {
  return measureMeta.get(profileId) ?? null;
}

export function setTailorPickup(
  orderId: string,
  expectedPickupOn: string,
): void {
  tailorPickupByOrder.set(orderId, { expectedPickupOn, nudgeSent: false });
}

export function getTailorPickup(orderId: string) {
  return tailorPickupByOrder.get(orderId) ?? null;
}

export function markTailorPickupNudgeSent(orderId: string): void {
  const row = tailorPickupByOrder.get(orderId);
  if (row) tailorPickupByOrder.set(orderId, { ...row, nudgeSent: true });
}

export function setPhotoDumpTriageAt(itemId: string, iso: string): void {
  photoDumpTriageAt.set(itemId, iso);
}

export function getPhotoDumpTriageAt(itemId: string): string | null {
  return photoDumpTriageAt.get(itemId) ?? null;
}

export function clearPhotoDumpTriageAt(itemId: string): void {
  photoDumpTriageAt.delete(itemId);
}

export function appendLentWasteNote(userId: string, note: string): void {
  const list = lentWasteNotes.get(userId) ?? [];
  list.push(note);
  lentWasteNotes.set(userId, list);
}

export function listLentWasteNotes(userId: string): string[] {
  return [...(lentWasteNotes.get(userId) ?? [])];
}

/** Test helper */
export function __resetClosetOpsPrefsForTests(): void {
  laundryRulesByUser.clear();
  cpwThresholdByUser.clear();
  missingLayerDismissed.clear();
  keepSnoozeByItem.clear();
  measureMeta.clear();
  tailorPickupByOrder.clear();
  photoDumpTriageAt.clear();
  lentWasteNotes.clear();
}
