/**
 * UX-PERF-LISTS — when Closet lists grow past this threshold, switch to a
 * windowed FlatList so low-end Android stays smooth.
 *
 * Perf checklist (PR / QA):
 * - [x] Wardrobe clean + laundry lists virtualize at >50 items
 * - [x] Vault credits + receipts virtualize at >50 items
 * - [x] Accountant ledger virtualizes at >50 (no hard slice-20)
 * - [x] Item thumbs use CachedClosetImage (disk/memory cache hint)
 * - [x] Nested ScrollView lists use a bounded window height so recycling works
 * - [x] W098 — disposition listings, packages panels, metrics activity at >50
 */

/** Virtualize when item count exceeds this (acceptance: >50). */
export const LIST_VIRTUALIZE_THRESHOLD = 50;

/** Default row estimate for getItemLayout / window height. */
export const LIST_ESTIMATED_ITEM_SIZE = 120;

/** Visible rows inside a nested ScrollView window. */
export const LIST_NESTED_WINDOW_ROWS = 6;

export function shouldVirtualizeList(
  count: number,
  threshold: number = LIST_VIRTUALIZE_THRESHOLD,
): boolean {
  return count > threshold;
}

/** Bounded height so FlatList can recycle while nested in ClosetScreen ScrollView. */
export function nestedVirtualListHeight(
  estimatedItemSize: number = LIST_ESTIMATED_ITEM_SIZE,
  windowRows: number = LIST_NESTED_WINDOW_ROWS,
): number {
  return Math.max(estimatedItemSize, estimatedItemSize * windowRows);
}
