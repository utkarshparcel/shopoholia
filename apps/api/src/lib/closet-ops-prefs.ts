/**
 * Closet ops prefs. Laundry rules (U032), missing-layer dismissals (U034) and the CPW threshold
 * (U036) live in `users.prefs` (C2: written only through repos.patchUserPrefs). The rest is still
 * in process memory (keep snooze, measure meta, tailor pickup, photo-dump triage, lent notes).
 */

import {
  DEFAULT_CPW_THRESHOLD,
  DEFAULT_LAUNDRY_RULES,
  normalizeCpwThreshold,
  normalizeLaundryRules,
  type CpwThresholdPrefs,
  type LaundryRulesPrefs,
} from "@worn/shared";
import type { Repositories } from "./repositories/types.js";

/** `users.prefs.dismissedMissingLayerIds` keeps the newest 50. */
const MAX_DISMISSED_LAYERS = 50;
export const MAX_MISSING_LAYER_ID_LENGTH = 64;

/** C2 write; a missing user (erased mid-request) is an error, not a silent no-op. */
async function savePrefs(
  repos: Repositories,
  userId: string,
  patch: Parameters<Repositories["patchUserPrefs"]>[1],
): Promise<void> {
  if (!(await repos.patchUserPrefs(userId, patch))) throw new Error("user prefs not saved: user not found");
}

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

export async function getLaundryRules(repos: Repositories, userId: string): Promise<LaundryRulesPrefs> {
  const prefs = await repos.getUserPrefs(userId);
  return prefs?.laundryRules ? normalizeLaundryRules(prefs.laundryRules) : { ...DEFAULT_LAUNDRY_RULES };
}

export async function setLaundryRules(
  repos: Repositories,
  userId: string,
  patch: Partial<LaundryRulesPrefs>,
): Promise<LaundryRulesPrefs> {
  const next = normalizeLaundryRules({ ...(await getLaundryRules(repos, userId)), ...patch });
  await savePrefs(repos, userId, { laundryRules: next });
  return next;
}

export async function getCpwThreshold(repos: Repositories, userId: string): Promise<CpwThresholdPrefs> {
  const prefs = await repos.getUserPrefs(userId);
  return prefs?.cpwThreshold ? normalizeCpwThreshold(prefs.cpwThreshold) : { ...DEFAULT_CPW_THRESHOLD };
}

export async function setCpwThreshold(
  repos: Repositories,
  userId: string,
  patch: Partial<CpwThresholdPrefs>,
): Promise<CpwThresholdPrefs> {
  const next = normalizeCpwThreshold({ ...(await getCpwThreshold(repos, userId)), ...patch });
  await savePrefs(repos, userId, { cpwThreshold: next });
  return next;
}

/** Adds a dismissed gap id (newest last, at most 50). A repeat dismissal changes nothing. */
export async function dismissMissingLayer(
  repos: Repositories,
  userId: string,
  gapId: string,
): Promise<string[]> {
  if (gapId.length > MAX_MISSING_LAYER_ID_LENGTH) {
    throw new RangeError(`gap id longer than ${MAX_MISSING_LAYER_ID_LENGTH} characters`);
  }
  const current = await listDismissedMissingLayers(repos, userId);
  if (current.includes(gapId)) return current;
  const next = [...current, gapId].slice(-MAX_DISMISSED_LAYERS);
  await savePrefs(repos, userId, { dismissedMissingLayerIds: next });
  return next;
}

export async function listDismissedMissingLayers(repos: Repositories, userId: string): Promise<string[]> {
  const prefs = await repos.getUserPrefs(userId);
  return [...(prefs?.dismissedMissingLayerIds ?? [])];
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
  keepSnoozeByItem.clear();
  measureMeta.clear();
  tailorPickupByOrder.clear();
  photoDumpTriageAt.clear();
  lentWasteNotes.clear();
}
