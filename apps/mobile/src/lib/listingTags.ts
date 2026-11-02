/**
 * Listing labels people see. Imported catalog rows carry an internal `src:<site>` tag (where the
 * row was scraped from); it is shown as the store's name, never as "SRC:NEWME".
 */

const SOURCE_PREFIX = /^src:/i;

const STORE_NAMES: Record<string, string> = {
  newme: 'NEWME',
  shein: 'SHEIN',
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  myntra: 'Myntra',
  ajio: 'AJIO',
  nykaa: 'Nykaa',
};

/** The store a `src:<site>` tag names, or null for other tags and internal sources (synthetic). */
export function storeNameFromSourceTag(tag: string): string | null {
  if (!SOURCE_PREFIX.test(tag)) return null;
  const site = tag.replace(SOURCE_PREFIX, '').trim().toLowerCase();
  if (!site || site === 'synthetic') return null;
  return STORE_NAMES[site] ?? site.charAt(0).toUpperCase() + site.slice(1);
}

/** The tags to show on a listing: source tags become the store name; duplicates and blanks go. */
export function listingTagLabels(tags: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags ?? []) {
    const label = SOURCE_PREFIX.test(tag) ? storeNameFromSourceTag(tag) : tag.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}
