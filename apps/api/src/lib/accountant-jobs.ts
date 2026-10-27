/**
 * WV08-MONTHLY-DIGEST — schedule monthly closet P&L digest from accountant summary.
 */
import { utcMonthKey } from "@worn/shared";
import { scheduleMonthlyDigest, type MonthlyDigestPayload } from "./nudge-jobs.js";

export type AccountantDigestSummary = {
  monthlySpendMinor: number;
  costPerWearMinor?: number | null;
  avgCostPerWearMinor?: number | null;
  monthLabel?: string;
};

/** Build monthly digest payload from accountant summary fields. */
export function monthlyDigestPayloadFromSummary(
  userId: string,
  summary: AccountantDigestSummary,
  opts: { now?: Date; currency?: string } = {},
): MonthlyDigestPayload {
  const now = opts.now ?? new Date();
  const monthLabel = summary.monthLabel?.trim() || utcMonthKey(now);
  const avg =
    summary.avgCostPerWearMinor ?? summary.costPerWearMinor ?? null;
  return {
    userId,
    spendMinor: summary.monthlySpendMinor,
    avgCostPerWearMinor: avg,
    monthLabel,
    currency: opts.currency,
  };
}

/**
 * Enqueue monthly P&L digest (idempotent per user+UTC month).
 * Returns "skipped" when Redis is unavailable or enqueue fails.
 */
export async function scheduleAccountantMonthlyDigest(
  userId: string,
  summary: AccountantDigestSummary,
  opts: { delayMs?: number; now?: Date; currency?: string } = {},
): Promise<"published" | "skipped"> {
  const payload = monthlyDigestPayloadFromSummary(userId, summary, opts);
  return scheduleMonthlyDigest(payload, {
    delayMs: opts.delayMs,
    now: opts.now,
  });
}
