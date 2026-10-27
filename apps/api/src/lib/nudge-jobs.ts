import {
  FREQUENCY_CAP_WINDOW_MS,
  FOUND_MONEY_WAITING_EVENT,
  FOUND_MONEY_WAITING_JOB,
  MONTHLY_DIGEST_EVENT,
  MONTHLY_DIGEST_JOB,
  NUDGE_QUEUE,
  WEEKLY_DIGEST_EVENT,
  WEEKLY_DIGEST_JOB,
  deliverFoundMoneyWaiting,
  deliverMonthlyDigest,
  deliverWeeklyDigest,
  foundMoneyWaitingJobId,
  monthlyDigestJobId,
  notificationCategoryForEvent,
  utcIsoWeekKey,
  utcMonthKey,
  weeklyDigestJobId,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

export {
  NUDGE_QUEUE,
  FOUND_MONEY_WAITING_JOB,
  WEEKLY_DIGEST_JOB,
  MONTHLY_DIGEST_JOB,
  FOUND_MONEY_WAITING_EVENT,
  WEEKLY_DIGEST_EVENT,
  MONTHLY_DIGEST_EVENT,
  foundMoneyWaitingJobId,
  weeklyDigestJobId,
  monthlyDigestJobId,
  utcIsoWeekKey,
  utcMonthKey,
};

export type FoundMoneyWaitingPayload = {
  userId: string;
  totalMinor: number;
  accountCount: number;
  currency?: string;
  /** ISO week the job was scheduled for; the push dedupes on it so a retry next week can't resend. */
  weekKey?: string;
};

export type WeeklyDigestPayload = {
  userId: string;
  spendMinor: number;
  /** Vault remaining — W026 “you still have”. */
  stillHaveMinor?: number | null;
  avgCostPerWearMinor?: number | null;
  currency?: string;
  weekKey?: string;
};

export type MonthlyDigestPayload = {
  userId: string;
  spendMinor: number;
  avgCostPerWearMinor?: number | null;
  monthLabel?: string;
  currency?: string;
  /** Month the job was scheduled for (YYYY-MM); the push dedupes on it. */
  monthKey?: string;
};

export type NudgeRepos = {
  findUserById: (id: string) => Promise<{
    prefs?: Record<string, unknown> | null;
    timeZone?: string | null;
    pushToken?: string | null;
  } | null>;
  recordPushEvent: (input: {
    userId: string;
    orderId: string | null;
    eventType: string;
    dedupeKey: string;
    title: string;
    body: string;
    payload: Record<string, unknown>;
    status: "QUEUED";
  }) => Promise<{ id: string; status?: "QUEUED" | "SENT" | "FAILED" }>;
  updatePushEventStatus?: (
    id: string,
    status: "SENT" | "FAILED",
    expoTicketId?: string | null,
  ) => Promise<void>;
  /** Count SENT/QUEUED push_events for event types in category since `since`. */
  countRecentPushEvents?: (input: {
    userId: string;
    eventTypes: string[];
    since: Date;
  }) => Promise<number>;
};

const CREDITS_REENGAGE_EVENTS = ["FOUND_MONEY_WAITING", "CREDIT_EXPIRY"] as const;
const DIGEST_REENGAGE_EVENTS = ["WEEKLY_DIGEST", "MONTHLY_DIGEST"] as const;
/** Monthly digest is once/month — count only MONTHLY_DIGEST in a ~35-day window. */
const MONTHLY_DIGEST_CAP_WINDOW_MS = 35 * 86_400_000;

async function recentCountForEvent(
  repos: NudgeRepos,
  userId: string,
  eventType: string,
  now: Date,
): Promise<number> {
  if (!repos.countRecentPushEvents) return 0;
  if (eventType === MONTHLY_DIGEST_EVENT) {
    return repos.countRecentPushEvents({
      userId,
      eventTypes: [MONTHLY_DIGEST_EVENT],
      since: new Date(now.getTime() - MONTHLY_DIGEST_CAP_WINDOW_MS),
    });
  }
  const category = notificationCategoryForEvent(eventType);
  const eventTypes =
    category === "credits"
      ? [...CREDITS_REENGAGE_EVENTS]
      : category === "digest"
        ? [...DIGEST_REENGAGE_EVENTS]
        : [eventType];
  return repos.countRecentPushEvents({
    userId,
    eventTypes,
    since: new Date(now.getTime() - FREQUENCY_CAP_WINDOW_MS),
  });
}

/**
 * Schedule found-money waiting nudge for the current ISO week (idempotent jobId).
 * Delay defaults to ~D7 style: 7 days from now unless `delayMs` is provided.
 */
export async function scheduleFoundMoneyWaiting(
  payload: FoundMoneyWaitingPayload,
  opts: { delayMs?: number; now?: Date } = {},
): Promise<"published" | "skipped"> {
  if (payload.totalMinor <= 0) return "skipped";
  const now = opts.now ?? new Date();
  const weekKey = utcIsoWeekKey(now);
  const delayMs = opts.delayMs ?? 7 * 86_400_000;
  // Throws QueueUnavailableError when Redis can't take it; "skipped" only without Redis off-prod.
  const result = await enqueueJob(
    NUDGE_QUEUE,
    FOUND_MONEY_WAITING_JOB,
    { ...payload, weekKey },
    {
      delay: Math.max(0, delayMs),
      jobId: jobIdFrom(foundMoneyWaitingJobId(payload.userId, weekKey)),
    },
  );
  return result.status === "queued" ? "published" : "skipped";
}

/** Schedule weekly digest for the current ISO week (idempotent). */
export async function scheduleWeeklyDigest(
  payload: WeeklyDigestPayload,
  opts: { delayMs?: number; now?: Date } = {},
): Promise<"published" | "skipped"> {
  const now = opts.now ?? new Date();
  const weekKey = utcIsoWeekKey(now);
  const delayMs = opts.delayMs ?? 0;
  // Throws QueueUnavailableError when Redis can't take it; "skipped" only without Redis off-prod.
  const result = await enqueueJob(
    NUDGE_QUEUE,
    WEEKLY_DIGEST_JOB,
    { ...payload, weekKey },
    {
      delay: Math.max(0, delayMs),
      jobId: jobIdFrom(weeklyDigestJobId(payload.userId, weekKey)),
    },
  );
  return result.status === "queued" ? "published" : "skipped";
}

/** Schedule monthly closet P&L digest for the current UTC month (idempotent). */
export async function scheduleMonthlyDigest(
  payload: MonthlyDigestPayload,
  opts: { delayMs?: number; now?: Date } = {},
): Promise<"published" | "skipped"> {
  const now = opts.now ?? new Date();
  const monthKey = utcMonthKey(now);
  const delayMs = opts.delayMs ?? 0;
  const body: MonthlyDigestPayload = {
    ...payload,
    monthLabel: payload.monthLabel ?? monthKey,
    monthKey,
  };
  // Throws QueueUnavailableError when Redis can't take it; "skipped" only without Redis off-prod.
  const result = await enqueueJob(NUDGE_QUEUE, MONTHLY_DIGEST_JOB, body, {
    delay: Math.max(0, delayMs),
    jobId: jobIdFrom(monthlyDigestJobId(payload.userId, monthKey)),
  });
  return result.status === "queued" ? "published" : "skipped";
}

export async function processFoundMoneyWaiting(
  payload: FoundMoneyWaitingPayload,
  repos: NudgeRepos,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const user = await repos.findUserById(payload.userId);
  if (!user) return { status: "skipped" };
  const weekKey = payload.weekKey ?? utcIsoWeekKey(now);
  const recentCategoryCount = await recentCountForEvent(
    repos,
    payload.userId,
    FOUND_MONEY_WAITING_EVENT,
    now,
  );

  return deliverFoundMoneyWaiting({
    totalMinor: payload.totalMinor,
    accountCount: payload.accountCount,
    currency: payload.currency,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    recentCategoryCount,
    now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: FOUND_MONEY_WAITING_EVENT,
        dedupeKey: foundMoneyWaitingJobId(payload.userId, weekKey),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}

export async function processWeeklyDigest(
  payload: WeeklyDigestPayload,
  repos: NudgeRepos,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const user = await repos.findUserById(payload.userId);
  if (!user) return { status: "skipped" };
  const weekKey = payload.weekKey ?? utcIsoWeekKey(now);
  const recentCategoryCount = await recentCountForEvent(
    repos,
    payload.userId,
    WEEKLY_DIGEST_EVENT,
    now,
  );

  return deliverWeeklyDigest({
    spendMinor: payload.spendMinor,
    stillHaveMinor: payload.stillHaveMinor,
    avgCostPerWearMinor: payload.avgCostPerWearMinor,
    currency: payload.currency,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    recentCategoryCount,
    now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: WEEKLY_DIGEST_EVENT,
        dedupeKey: weeklyDigestJobId(payload.userId, weekKey),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}

export async function processMonthlyDigest(
  payload: MonthlyDigestPayload,
  repos: NudgeRepos,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const monthKey = payload.monthKey ?? utcMonthKey(now);
  const monthLabel = payload.monthLabel ?? monthKey;
  const user = await repos.findUserById(payload.userId);
  if (!user) return { status: "skipped" };
  const recentCategoryCount = await recentCountForEvent(
    repos,
    payload.userId,
    MONTHLY_DIGEST_EVENT,
    now,
  );

  return deliverMonthlyDigest({
    spendMinor: payload.spendMinor,
    avgCostPerWearMinor: payload.avgCostPerWearMinor,
    monthLabel,
    currency: payload.currency,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    recentCategoryCount,
    now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: MONTHLY_DIGEST_EVENT,
        dedupeKey: monthlyDigestJobId(payload.userId, monthKey),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}
