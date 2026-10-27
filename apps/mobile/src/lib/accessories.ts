/**
 * N30 accessories / jewelry vault — category helpers for Closet mobile.
 * Re-exports create-friendly labels used when adding jewelry to the wardrobe.
 */

export const ACCESSORY_VAULT_PRESETS = [
  "jewelry",
  "necklace",
  "earrings",
  "bracelet",
  "ring",
  "watch",
  "belt",
  "scarf",
  "bag",
] as const;

export type AccessoryVaultPreset = (typeof ACCESSORY_VAULT_PRESETS)[number];

const JEWELRY_RE =
  /\b(jewelry|jewellery|necklace|earrings?|bracelet|bangle|ring|pendant|choker)\b/i;
const ACCESSORY_RE =
  /\b(belt|scarf|hat|bag|watch|jewelry|jewellery|tie|cap|necklace|earrings?|bracelet|ring)\b/i;

/** Normalize free text into a vault accessory category (or null). */
export function normalizeAccessoryCategory(raw: string): AccessoryVaultPreset | null {
  const c = raw.trim().toLowerCase();
  if (!c) return null;
  if (JEWELRY_RE.test(c)) {
    if (/\bearrings?\b/.test(c)) return "earrings";
    if (/\bnecklace|pendant|choker\b/.test(c)) return "necklace";
    if (/\bbracelet|bangle\b/.test(c)) return "bracelet";
    if (/\bring\b/.test(c)) return "ring";
    return "jewelry";
  }
  for (const known of ACCESSORY_VAULT_PRESETS) {
    if (c === known || c.includes(known)) return known;
  }
  if (ACCESSORY_RE.test(c)) return "jewelry";
  return null;
}

export function isAccessoryCategory(category: string): boolean {
  return normalizeAccessoryCategory(category) != null;
}

/** Category string to send when creating an accessories vault item. */
export function createAccessoryCategory(input: string): string {
  return normalizeAccessoryCategory(input) ?? (input.trim() || "jewelry");
}

/** W066 — split outfit pieces into core vs accessories slot. */
export function partitionOutfitItems<T extends { id: string; category: string }>(
  items: T[],
): { core: T[]; accessories: T[] } {
  const core: T[] = [];
  const accessories: T[] = [];
  for (const it of items) {
    if (isAccessoryCategory(it.category)) accessories.push(it);
    else core.push(it);
  }
  return { core, accessories };
}

/**
 * W066 — attach or swap an accessory on today's outfit itemIds.
 * Removes existing accessory ids (when known via `items`) then appends `nextAccessoryId`.
 */
export function withAccessoryOnOutfit(
  itemIds: string[],
  items: Array<{ id: string; category: string }>,
  nextAccessoryId: string,
): string[] {
  const accessoryIds = new Set(
    items.filter((i) => isAccessoryCategory(i.category)).map((i) => i.id),
  );
  const coreIds = itemIds.filter((id) => !accessoryIds.has(id) && id !== nextAccessoryId);
  return [...coreIds, nextAccessoryId];
}

/** Remove all known accessories from the outfit (empty slot). */
export function withoutAccessoriesOnOutfit(
  itemIds: string[],
  items: Array<{ id: string; category: string }>,
): string[] {
  const accessoryIds = new Set(
    items.filter((i) => isAccessoryCategory(i.category)).map((i) => i.id),
  );
  return itemIds.filter((id) => !accessoryIds.has(id));
}
