/**
 * N30-ACCESSORIES — accessories / jewelry vault helpers.
 * Attach accessories to morning outfits; wear_log expands via outfit.itemIds.
 */

import { categorySlot, goesWithScore, type GoesWithCandidate } from "./outfit-goes-with.js";

export type AccessoryItem = GoesWithCandidate & {
  laundryStatus?: string | null;
};

/** Canonical vault categories for accessories / jewelry. */
export const ACCESSORY_CATEGORIES = [
  "jewelry",
  "jewellery",
  "necklace",
  "earrings",
  "bracelet",
  "ring",
  "watch",
  "belt",
  "scarf",
  "hat",
  "cap",
  "tie",
  "bag",
] as const;

export type AccessoryCategory = (typeof ACCESSORY_CATEGORIES)[number];

const JEWELRY_RE =
  /\b(jewelry|jewellery|necklace|earrings?|bracelet|bangle|ring|pendant|choker)\b/i;
const ACCESSORY_RE =
  /\b(belt|scarf|hat|bag|watch|jewelry|jewellery|tie|cap|necklace|earrings?|bracelet|ring)\b/i;

/** Normalize free-text into a vault accessory category label when applicable. */
export function normalizeAccessoryCategory(raw: string): AccessoryCategory | null {
  const c = raw.trim().toLowerCase();
  if (!c) return null;
  if (JEWELRY_RE.test(c) || c === "jewelry" || c === "jewellery") {
    if (/\bearrings?\b/.test(c)) return "earrings";
    if (/\bnecklace|pendant|choker\b/.test(c)) return "necklace";
    if (/\bbracelet|bangle\b/.test(c)) return "bracelet";
    if (/\bring\b/.test(c)) return "ring";
    return "jewelry";
  }
  for (const known of ACCESSORY_CATEGORIES) {
    if (c === known || c.includes(known)) return known;
  }
  if (ACCESSORY_RE.test(c) || categorySlot(raw) === "accessory") {
    return "jewelry";
  }
  return null;
}

/** True when category belongs in the accessories / jewelry vault. */
export function isAccessoryCategory(category: string): boolean {
  return categorySlot(category) === "accessory" || normalizeAccessoryCategory(category) != null;
}

/** Create-friendly category string for the accessories vault. */
export function createAccessoryCategory(input: string): string {
  const normalized = normalizeAccessoryCategory(input);
  if (normalized) return normalized;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : "jewelry";
}

/**
 * Pick up to `limit` accessories that pair with the current outfit core.
 * Skips accessories already in `selected`, and bags already chosen as core.
 */
export function attachAccessoriesToOutfit(
  selected: AccessoryItem[],
  wardrobe: AccessoryItem[],
  opts?: { limit?: number; excludeIds?: Set<string> },
): AccessoryItem[] {
  const limit = opts?.limit ?? 1;
  const exclude = opts?.excludeIds ?? new Set<string>();
  const selectedIds = new Set(selected.map((s) => s.id));
  const alreadyHasAccessory = selected.some((s) => isAccessoryCategory(s.category));
  if (alreadyHasAccessory || limit <= 0) return [];

  const core = selected.filter((s) => !isAccessoryCategory(s.category));
  if (core.length === 0) return [];

  const candidates = wardrobe.filter(
    (it) =>
      isAccessoryCategory(it.category) &&
      !selectedIds.has(it.id) &&
      !exclude.has(it.id),
  );
  if (candidates.length === 0) return [];

  // Score each accessory against the average of core pieces
  const scored = candidates.map((acc) => {
    let total = 0;
    let n = 0;
    for (const piece of core) {
      const { score } = goesWithScore(piece, acc);
      if (score > 0) {
        total += score;
        n += 1;
      }
    }
    const score = n > 0 ? total / n : 0;
    return { acc, score };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score || a.acc.category.localeCompare(b.acc.category),
  );

  return scored
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => s.acc);
}

/** Item ids covered by a wear log (direct + outfit expansion). Includes accessories on the outfit. */
export function wearLogItemIds(
  log: { wardrobeItemId?: string | null; outfitId?: string | null },
  outfits: Array<{ id: string; itemIds: string[] }>,
): string[] {
  const ids: string[] = [];
  if (log.wardrobeItemId) ids.push(log.wardrobeItemId);
  if (log.outfitId) {
    const outfit = outfits.find((o) => o.id === log.outfitId);
    if (outfit) ids.push(...outfit.itemIds);
  }
  return [...new Set(ids)];
}
