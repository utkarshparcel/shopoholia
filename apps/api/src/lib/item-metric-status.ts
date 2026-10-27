import type { ItemMetricRecord } from "./repositories/types.js";

const DAY_MS = 86_400_000;

/**
 * An item's rotation status at `at`, computed on read (GETs never write it): DEAD after 90 days
 * without a wear, DORMANT after 60. A never-worn item counts from when it was added, and turns
 * DORMANT after 30 days.
 */
export function itemMetricStatusAt(
  metric: Pick<ItemMetricRecord, "lastWornAt" | "createdAt">,
  at: Date,
): ItemMetricRecord["status"] {
  if (!metric.lastWornAt) {
    const ageDays = (at.getTime() - metric.createdAt.getTime()) / DAY_MS;
    return ageDays > 90 ? "DEAD" : ageDays > 30 ? "DORMANT" : "ACTIVE";
  }
  const daysSince = (at.getTime() - metric.lastWornAt.getTime()) / DAY_MS;
  return daysSince > 90 ? "DEAD" : daysSince > 60 ? "DORMANT" : "ACTIVE";
}
