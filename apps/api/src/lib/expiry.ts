// Mirrors apps/api/src/lib/ingest-queue.ts. Kept local to avoid a hard
// build-time dependency on the worker package from the API.
import type { Queue } from "bullmq";

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
};

export type WarrantyExpiryPayload = {
  warrantyId: string;
  userId: string;
  itemTitle: string;
  provider: string;
  coverageUntil: string;
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
 * Best-effort publish of a delayed expiry-reminder job to the worker-expiry
 * BullMQ queue.
 *
 * Requires a Redis connection (EXPIRY_REDIS_URL / REDIS_URL). When Redis is
 * unavailable — or the account has no future expiry — this resolves to
 * "skipped" and does NOT throw. Callers must never let this block the request
 * path.
 *
 * Fires 7 days before expiresAt (CREDIT_LEAD_MS). If already inside the
 * lead window, fires in 100ms. Skips only when already expired. Uses a
 * stable jobId so re-scheduling replaces rather than duplicates.
 */
export async function scheduleExpiryReminder(
  account: ExpiryAccountLike,
): Promise<"published" | "skipped"> {
  const redisUrl = process.env.EXPIRY_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl || !account.expiresAt) return "skipped";

  const effectiveDelay = computeExpiryDelayMs(account.expiresAt, CREDIT_LEAD_MS);
  if (effectiveDelay === null) return "skipped";

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(CREDIT_EXPIRY_QUEUE, { connection: redisUrl });
    const payload: CreditExpiryPayload = {
      accountId: account.id,
      userId: account.userId,
      merchant: account.merchant,
      expiresAt: new Date(account.expiresAt).toISOString(),
    };
    await queue.add(CREDIT_EXPIRY_JOB, payload, {
      delay: effectiveDelay,
      jobId: creditExpiryJobId(account.id),
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[audit] credit-expiry.enqueue.failed", {
      accountId: account.id,
      error: String(err),
    });
    return "skipped";
  }
}

/**
 * Best-effort publish of a delayed warranty-expiry-reminder job to the
 * worker-expiry BullMQ queue. Mirrors `scheduleExpiryReminder`: skips when
 * Redis is unavailable or the warranty has no future coverage end.
 */
export async function scheduleWarrantyReminder(
  warranty: WarrantyReminderLike,
): Promise<"published" | "skipped"> {
  const redisUrl = process.env.EXPIRY_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl || !warranty.coverageUntil) return "skipped";

  // QA:M6 — fire 14 days BEFORE lapse so the user can act, not at expiry
  const effectiveDelay = computeExpiryDelayMs(warranty.coverageUntil, WARRANTY_LEAD_MS);
  if (effectiveDelay === null) return "skipped";

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(WARRANTY_EXPIRY_QUEUE, { connection: redisUrl });
    const payload: WarrantyExpiryPayload = {
      warrantyId: warranty.id,
      userId: warranty.userId,
      itemTitle: warranty.itemTitle,
      provider: warranty.provider,
      coverageUntil: new Date(warranty.coverageUntil).toISOString(),
    };
    await queue.add(WARRANTY_EXPIRY_JOB, payload, {
      delay: effectiveDelay,
      jobId: warrantyExpiryJobId(warranty.id),
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[audit] warranty-expiry.enqueue.failed", {
      warrantyId: warranty.id,
      error: String(err),
    });
    return "skipped";
  }
}

/**
 * Same as scheduleWarrantyReminder for several warranties, on one queue connection
 * (receipt confirm). Returns how many were published.
 */
export async function scheduleWarrantyReminders(
  warranties: WarrantyReminderLike[],
): Promise<number> {
  const redisUrl = process.env.EXPIRY_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return 0;
  const jobs = warranties.flatMap((warranty) => {
    if (!warranty.coverageUntil) return [];
    const delay = computeExpiryDelayMs(warranty.coverageUntil, WARRANTY_LEAD_MS);
    if (delay === null) return [];
    const payload: WarrantyExpiryPayload = {
      warrantyId: warranty.id,
      userId: warranty.userId,
      itemTitle: warranty.itemTitle,
      provider: warranty.provider,
      coverageUntil: new Date(warranty.coverageUntil).toISOString(),
    };
    return [{ name: WARRANTY_EXPIRY_JOB, data: payload, opts: { delay, jobId: warrantyExpiryJobId(warranty.id) } }];
  });
  if (jobs.length === 0) return 0;
  let queue: Queue | undefined;
  try {
    const bullmq = await import("bullmq");
    queue = new bullmq.Queue(WARRANTY_EXPIRY_QUEUE, { connection: redisUrl });
    for (const job of jobs) await queue.add(job.name, job.data, job.opts);
    return jobs.length;
  } catch (err) {
    console.warn("[audit] warranty-expiry.enqueue.failed", {
      warrantyIds: warranties.map((w) => w.id),
      error: String(err),
    });
    return 0;
  } finally {
    await queue?.close().catch((err: unknown) => {
      console.warn("[audit] warranty-expiry.queue-close.failed", { error: String(err) });
    });
  }
}

/**
 * Reschedule the warranty-expiry reminder with a stable jobId so BullMQ
 * replaces the prior delayed job. `snoozeUntil` must be strictly after now.
 */
export async function snoozeWarrantyReminder(
  warranty: WarrantyReminderLike,
  snoozeUntil: Date,
): Promise<"published" | "skipped"> {
  const redisUrl = process.env.EXPIRY_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl || !warranty.coverageUntil) return "skipped";

  const effectiveDelay = computeSnoozeDelayMs(snoozeUntil);
  if (effectiveDelay === null) return "skipped";

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(WARRANTY_EXPIRY_QUEUE, { connection: redisUrl });
    const payload: WarrantyExpiryPayload = {
      warrantyId: warranty.id,
      userId: warranty.userId,
      itemTitle: warranty.itemTitle,
      provider: warranty.provider,
      coverageUntil: new Date(warranty.coverageUntil).toISOString(),
    };
    await queue.add(WARRANTY_EXPIRY_JOB, payload, {
      delay: effectiveDelay,
      jobId: warrantyExpiryJobId(warranty.id),
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[audit] warranty-expiry.snooze.failed", {
      warrantyId: warranty.id,
      error: String(err),
    });
    return "skipped";
  }
}

/**
 * U003 — reschedule credit-expiry reminder after user marks checklist handled.
 * Uses the same stable jobId so BullMQ replaces the prior delayed job.
 */
export async function snoozeCreditReminder(
  account: ExpiryAccountLike,
  snoozeUntil: Date,
): Promise<"published" | "skipped"> {
  const redisUrl = process.env.EXPIRY_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl || !account.expiresAt) return "skipped";

  const effectiveDelay = computeSnoozeDelayMs(snoozeUntil);
  if (effectiveDelay === null) return "skipped";

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(CREDIT_EXPIRY_QUEUE, { connection: redisUrl });
    const payload: CreditExpiryPayload = {
      accountId: account.id,
      userId: account.userId,
      merchant: account.merchant,
      expiresAt: new Date(account.expiresAt).toISOString(),
    };
    await queue.add(CREDIT_EXPIRY_JOB, payload, {
      delay: effectiveDelay,
      jobId: creditExpiryJobId(account.id),
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[audit] credit-expiry.snooze.failed", {
      accountId: account.id,
      error: String(err),
    });
    return "skipped";
  }
}
