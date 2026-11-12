/**
 * Closet ops prefs. Laundry rules (U032), missing-layer dismissals (U034) and the CPW threshold
 * (U036) live in `users.prefs` (C2: written only through repos.patchUserPrefs). Keep snooze and
 * photo-dump triage are columns on the wardrobe item, lent write-off notes a table
 * (`lent_waste_notes`); measurement change notes and tailor pickups are on their own rows.
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

/** U035 — snoozes the waste nudge for the user's item until `until`; false if not theirs. */
export async function setKeepSnooze(
  repos: Pick<Repositories, "setWardrobeItemMarks">,
  userId: string,
  wardrobeItemId: string,
  until: string,
): Promise<boolean> {
  return repos.setWardrobeItemMarks(wardrobeItemId, userId, { keepSnoozedUntil: new Date(until) });
}

export async function getKeepSnooze(
  repos: Pick<Repositories, "getWardrobeItemMarks">,
  userId: string,
  wardrobeItemId: string,
): Promise<string | null> {
  return (await repos.getWardrobeItemMarks(wardrobeItemId, userId))?.keepSnoozedUntil?.toISOString() ?? null;
}

/** U040 — when the item's photo-dump triage was decided (the undo window runs from it). */
export async function setPhotoDumpTriageAt(
  repos: Pick<Repositories, "setWardrobeItemMarks">,
  userId: string,
  itemId: string,
  at: Date | null,
): Promise<boolean> {
  return repos.setWardrobeItemMarks(itemId, userId, { photoDumpTriagedAt: at });
}

export async function getPhotoDumpTriageAt(
  repos: Pick<Repositories, "getWardrobeItemMarks">,
  userId: string,
  itemId: string,
): Promise<string | null> {
  return (await repos.getWardrobeItemMarks(itemId, userId))?.photoDumpTriagedAt?.toISOString() ?? null;
}

/** U039 — a "lost while lent" write-off note. */
export async function appendLentWasteNote(
  repos: Pick<Repositories, "appendLentWasteNote">,
  userId: string,
  wardrobeItemId: string | null,
  note: string,
): Promise<void> {
  await repos.appendLentWasteNote({ userId, wardrobeItemId, note });
}

export async function listLentWasteNotes(
  repos: Pick<Repositories, "listLentWasteNotes">,
  userId: string,
): Promise<string[]> {
  return (await repos.listLentWasteNotes(userId)).map((n) => n.note);
}
