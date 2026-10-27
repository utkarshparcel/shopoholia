import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

// Mirrors apps/api/src/lib/ingest-queue.ts. Kept local to avoid a hard
// build-time dependency on the worker package from the API.

export const CREDIT_EXPIRY_QUEUE = "credit-expiry";
export const CREDIT_EXPIRY_JOB = "credit-expiry-reminder";

export const WARRANTY_EXPIRY_QUEUE = "warranty-expiry";
export const WARRANTY_EXPIRY_JOB = "warranty-expiry-reminder";

/** Gift cards / store credits need an earlier nudge than warranties. */
export const CREDIT_LEAD_MS = 7 * 86_400_000;
export const WARRANTY_LEAD_MS = 14 * 86_400_000;
/** Default snooze push when user taps "remind me later". */
export const WARRANTY_SNOOZE_DEFAULT_MS = 3 * 86_400_000;
/** U003 — mark expiry checklist handled → snooze credit push 7d. */
export const CREDIT_SNOOZE_DEFAULT_MS = 7 * 86_400_000;

export type CreditExpiryPayload = {
  accountId: string;
  userId: string;
  merchant: string;
  expiresAt: string;
  /** Set on a snoozed reminder; it gets its own job and push dedupe key. */
  snoozedUntil?: string;
};

export type WarrantyExpiryPayload = {
  warrantyId: string;
  userId: string;
  itemTitle: string;
  provider: string;
  coverageUntil: string;
  snoozedUntil?: string;
};

export type ExpiryAccountLike = {
  id: string;
  userId: string;
  merchant: string;
  expiresAt: Date | null;
};

export type WarrantyReminderLike = {
  id: string;
  userId: string;
  itemTitle: string;
  provider: string;
  coverageUntil: Date | null;
};

/** Stable BullMQ jobId so re-scheduling replaces rather than duplicates. */
export function creditExpiryJobId(accountId: string): string {
  return `credit-expiry:${accountId}`;
}

export function warrantyExpiryJobId(warrantyId: string): string {
  return `warranty-expiry:${warrantyId}`;
}

/**
 * Delay until a snooze-until timestamp. Returns null when the target is not
 * strictly in the future (snooze must reschedule after now).
 */
export function computeSnoozeDelayMs(
  snoozeUntil: Date,
  nowMs: number = Date.now(),
): number | null {
  const delayMs = new Date(snoozeUntil).getTime() - nowMs;
  return delayMs > 0 ? delayMs : null;
}

/**
 * Compute effective delay for an expiry reminder.
 * Returns null when already expired (skip). Otherwise fires at
 * `expiresAt - leadMs`, or 100ms if already inside the lead window.
 */
export function computeExpiryDelayMs(
  expiresAt: Date,
  leadMs: number,
  nowMs: number = Date.now(),
): number | null {
  const expiryMs = new Date(expiresAt).getTime();
  if (expiryMs <= nowMs) return null;
  const delayMs = expiryMs - leadMs - nowMs;
  return delayMs <= 0 ? 100 : delayMs;
}

/**
 * Publish a delayed expiry-reminder job to the worker-expiry BullMQ queue.
 *
 * Resolves to "skipped" when the account has no future expiry (or without
 * Redis outside production). Throws QueueUnavailableError when Redis can't
 * take the job.
 *
 * Fires 7 days before expiresAt (CREDIT_LEAD_MS). If already inside the
 * lead window, fires in 100ms. Skips only when already expired. The jobId is
 * keyed on the expiry, so scheduling twice is one job and a new expiry gets
 * its own.
 */
export async function scheduleExpiryReminder(
  account: ExpiryAccountLike,
): Promise<"published" | "skipped"> {
  if (!account.expiresAt) return "skipped";

  const effectiveDelay = computeExpiryDelayMs(account.expiresAt, CREDIT_LEAD_MS);
  if (effectiveDelay === null) return "skipped";

  const payload: CreditExpiryPayload = {
    accountId: account.id,
    userId: account.userId,
    merchant: account.merchant,
    expiresAt: new Date(account.expiresAt).toISOString(),
  };
  const result = await enqueueJob(CREDIT_EXPIRY_QUEUE, CREDIT_EXPIRY_JOB, payload, {
    delay: effectiveDelay,
    jobId: jobIdFrom(creditExpiryJobId(account.id), payload.expiresAt),
  });
  return result.status === "queued" ? "published" : "skipped";
}

/**
 * Publish a delayed warranty-expiry-reminder job to the worker-expiry BullMQ
 * queue. Mirrors `scheduleExpiryReminder`: skips when the warranty has no
 * future coverage end; throws QueueUnavailableError when Redis can't take it.
 */
export async function scheduleWarrantyReminder(
  warranty: WarrantyReminderLike,
): Promise<"published" | "skipped"> {
  if (!warranty.coverageUntil) return "skipped";

  // QA:M6 — fire 14 days BEFORE lapse so the user can act, not at expiry
  const effectiveDelay = computeExpiryDelayMs(warranty.coverageUntil, WARRANTY_LEAD_MS);
  if (effectiveDelay === null) return "skipped";

  const payload: WarrantyExpiryPayload = {
    warrantyId: warranty.id,
    userId: warranty.userId,
    itemTitle: warranty.itemTitle,
    provider: warranty.provider,
    coverageUntil: new Date(warranty.coverageUntil).toISOString(),
  };
  const result = await enqueueJob(WARRANTY_EXPIRY_QUEUE, WARRANTY_EXPIRY_JOB, payload, {
    delay: effectiveDelay,
    jobId: jobIdFrom(warrantyExpiryJobId(warranty.id), payload.coverageUntil),
  });
  return result.status === "queued" ? "published" : "skipped";
}

/**
 * Same as scheduleWarrantyReminder for several warranties (receipt confirm). Best effort: a
 * warranty that can't be queued is logged, not thrown. Returns how many were published.
 */
export async function scheduleWarrantyReminders(
  warranties: WarrantyReminderLike[],
): Promise<number> {
  let published = 0;
  for (const warranty of warranties) {
    try {
      if ((await scheduleWarrantyReminder(warranty)) === "published") published += 1;
    } catch (err) {
      console.warn("[audit] warranty-expiry.enqueue.failed", { warrantyId: warranty.id, error: String(err) });
    }
  }
  return published;
}

/**
 * Schedule a snoozed warranty reminder at `snoozeUntil` (strictly after now).
 * It is its own job (keyed on the snooze time), so it isn't swallowed by the
 * original reminder's id. The original is not removed: it still fires if it
 * hadn't yet, since a snooze isn't stored anywhere the worker could check.
 */
export async function snoozeWarrantyReminder(
  warranty: WarrantyReminderLike,
  snoozeUntil: Date,
): Promise<"published" | "skipped"> {
  if (!warranty.coverageUntil) return "skipped";

  const effectiveDelay = computeSnoozeDelayMs(snoozeUntil);
  if (effectiveDelay === null) return "skipped";

  const payload: WarrantyExpiryPayload = {
    warrantyId: warranty.id,
    userId: warranty.userId,
    itemTitle: warranty.itemTitle,
    provider: warranty.provider,
    coverageUntil: new Date(warranty.coverageUntil).toISOString(),
    snoozedUntil: snoozeUntil.toISOString(),
  };
  const result = await enqueueJob(WARRANTY_EXPIRY_QUEUE, WARRANTY_EXPIRY_JOB, payload, {
    delay: effectiveDelay,
    jobId: jobIdFrom(warrantyExpiryJobId(warranty.id), "snooze", payload.snoozedUntil!),
  });
  return result.status === "queued" ? "published" : "skipped";
}

/**
 * U003 — schedule a snoozed credit-expiry reminder after the user marks the
 * checklist handled. Its own job, like `snoozeWarrantyReminder`.
 */
export async function snoozeCreditReminder(
  account: ExpiryAccountLike,
  snoozeUntil: Date,
): Promise<"published" | "skipped"> {
  if (!account.expiresAt) return "skipped";

  const effectiveDelay = computeSnoozeDelayMs(snoozeUntil);
  if (effectiveDelay === null) return "skipped";

  const payload: CreditExpiryPayload = {
    accountId: account.id,
    userId: account.userId,
    merchant: account.merchant,
    expiresAt: new Date(account.expiresAt).toISOString(),
    snoozedUntil: snoozeUntil.toISOString(),
  };
  const result = await enqueueJob(CREDIT_EXPIRY_QUEUE, CREDIT_EXPIRY_JOB, payload, {
    delay: effectiveDelay,
    jobId: jobIdFrom(creditExpiryJobId(account.id), "snooze", payload.snoozedUntil!),
  });
  return result.status === "queued" ? "published" : "skipped";
}
