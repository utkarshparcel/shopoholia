import type { RenderRecord } from "./types.js";

/**
 * The reveal's render order: oldest first, and renders made together (they share a created_at)
 * by order item, then scenario, then id. Stable across updates, and the same in every repository.
 */
export function sortRendersForReveal(renders: RenderRecord[]): RenderRecord[] {
  return [...renders].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.orderItemId.localeCompare(b.orderItemId) ||
      a.scenario.localeCompare(b.scenario) ||
      a.id.localeCompare(b.id),
  );
}
