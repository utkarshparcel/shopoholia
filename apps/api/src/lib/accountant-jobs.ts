/**
 * WV08-MONTHLY-DIGEST — schedule monthly closet P&L digest from accountant summary.
 */
import { MONTHLY_DIGEST_JOB, NUDGE_QUEUE, utcMonthKey } from "@worn/shared";
import { scheduleMonthlyDigest, type MonthlyDigestPayload } from "./nudge-jobs.js";
import { captureException } from "./sentry.js";

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
 * Returns "skipped" only without Redis outside production. A failed enqueue is logged and sent to
 * Sentry here, then rethrown (QueueUnavailableError), so a caller that runs it in the background
 * still leaves a trace.
 */
export async function scheduleAccountantMonthlyDigest(
  userId: string,
  summary: AccountantDigestSummary,
  opts: { delayMs?: number; now?: Date; currency?: string } = {},
): Promise<"published" | "skipped"> {
  const payload = monthlyDigestPayloadFromSummary(userId, summary, opts);
  try {
    return await scheduleMonthlyDigest(payload, {
      delayMs: opts.delayMs,
      now: opts.now,
    });
  } catch (err) {
    console.error("[accountant] monthly digest not enqueued", { userId }, err);
    captureException(err, { tags: { queue: NUDGE_QUEUE, job: MONTHLY_DIGEST_JOB } });
    throw err;
  }
}
