/**
 * UX-PERF-LISTS — bounded list rendering for Closet screens.
 *
 * - A screen whose main content is one long list (Wardrobe) passes it to ClosetScreen's `list`,
 *   which makes the whole screen one virtualized SectionList.
 * - Other lists sit inside the screen's single ScrollView and draw a page of rows at a time
 *   (ClosetVirtualList), never a FlatList nested in a ScrollView with guessed row heights.
 */

/** Rows a ClosetVirtualList draws at first, and adds per "Show more". */
export const LIST_PAGE_SIZE = 30;

/** The next number of rows to draw: one more page, capped at the total. */
export function nextVisibleCount(
  visible: number,
  total: number,
  pageSize: number = LIST_PAGE_SIZE,
): number {
  const page = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : LIST_PAGE_SIZE;
  return Math.min(Math.max(0, total), Math.max(0, visible) + page);
}
