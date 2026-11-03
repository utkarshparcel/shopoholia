import { RenderScenarioSchema } from "@worn/shared";

import type { RenderRecord } from "./types.js";

const SCENARIO_ORDER: readonly string[] = RenderScenarioSchema.options;

/**
 * The reveal's render order: oldest first, and renders made together (they share a created_at)
 * by order item, then scenario in its enum order (Studio first), then id. Stable across updates,
 * and the same in every repository.
 */
export function sortRendersForReveal(renders: RenderRecord[]): RenderRecord[] {
  return [...renders].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.orderItemId.localeCompare(b.orderItemId) ||
      SCENARIO_ORDER.indexOf(a.scenario) - SCENARIO_ORDER.indexOf(b.scenario) ||
      a.id.localeCompare(b.id),
  );
}
