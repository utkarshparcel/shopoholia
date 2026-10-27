import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import {
  FOUND_MONEY_WAITING_EVENT,
  MONTHLY_DIGEST_EVENT,
  WEEKLY_DIGEST_EVENT,
  deliverFoundMoneyWaiting,
  deliverMonthlyDigest,
  deliverWeeklyDigest,
  foundMoneyWaitingJobId,
  monthlyDigestJobId,
  utcIsoWeekKey,
  utcMonthKey,
  weeklyDigestJobId,
  FREQUENCY_CAP_WINDOW_MS,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import { pushEvents, recordPushEventIfNew, users, type Db } from "@worn/db";
import type {
  FoundMoneyWaitingPayload,
  MonthlyDigestPayload,
  WeeklyDigestPayload,
} from "./queues.js";

export type { FoundMoneyWaitingPayload, MonthlyDigestPayload, WeeklyDigestPayload };

export type ClosetPushHandlerOpts = {
  now?: Date;
  /**
   * When the job was created (BullMQ `job.timestamp`). The week or month key comes from it, so a
   * retry or a quiet-hours delay that crosses into the next period keeps the same push row.
   */
  createdAt?: Date;
  sendExpo?: typeof sendExpoPush;
};

const MONTHLY_DIGEST_CAP_WINDOW_MS = 35 * 86_400_000;

async function loadUser(db: Db, userId: string) {
  const [user] = await db
    .select({
      prefs: users.prefs,
      timeZone: users.timeZone,
      pushToken: users.pushToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

/** Pushes in the cap window, leaving out this job's own row so a rerun isn't capped by itself. */
async function countRecent(
  db: Db,
  userId: string,
  eventTypes: string[],
  ownDedupeKey: string,
  now: Date,
  windowMs: number = FREQUENCY_CAP_WINDOW_MS,
): Promise<number> {
  const since = new Date(now.getTime() - windowMs);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pushEvents)
    .where(
      and(
        eq(pushEvents.userId, userId),
        inArray(pushEvents.eventType, eventTypes),
        gte(pushEvents.createdAt, since),
        ne(pushEvents.dedupeKey, ownDedupeKey),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

/** push_events writes for the push flow: one row per dedupe key, safe to run twice. */
function pushRow(db: Db, userId: string, eventType: string, dedupeKey: string) {
  return {
    insertQueued: async ({ title, body, payload }: { title: string; body: string; payload: Record<string, unknown> }) => {
      const event = await recordPushEventIfNew(db, {
        userId,
        orderId: null,
        eventType,
        dedupeKey,
        title,
        body,
        payload,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id: string, status: "SENT" | "FAILED", expoTicketId?: string | null) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  };
}

export async function processFoundMoneyWaiting(
  payload: FoundMoneyWaitingPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const user = await loadUser(db, payload.userId);
  if (!user) return { status: "skipped" };
  const dedupeKey = foundMoneyWaitingJobId(payload.userId, utcIsoWeekKey(opts.createdAt ?? now));
  const recentCategoryCount = await countRecent(
    db,
    payload.userId,
    [FOUND_MONEY_WAITING_EVENT, "CREDIT_EXPIRY"],
    dedupeKey,
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
    ...pushRow(db, payload.userId, FOUND_MONEY_WAITING_EVENT, dedupeKey),
  });
}

export async function processWeeklyDigest(
  payload: WeeklyDigestPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const user = await loadUser(db, payload.userId);
  if (!user) return { status: "skipped" };
  const dedupeKey = weeklyDigestJobId(payload.userId, utcIsoWeekKey(opts.createdAt ?? now));
  const recentCategoryCount = await countRecent(
    db,
    payload.userId,
    [WEEKLY_DIGEST_EVENT, MONTHLY_DIGEST_EVENT],
    dedupeKey,
    now,
  );

  return deliverWeeklyDigest({
    spendMinor: payload.spendMinor,
    avgCostPerWearMinor: payload.avgCostPerWearMinor,
    currency: payload.currency,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    recentCategoryCount,
    now,
    sendExpo: opts.sendExpo,
    ...pushRow(db, payload.userId, WEEKLY_DIGEST_EVENT, dedupeKey),
  });
}

export async function processMonthlyDigest(
  payload: MonthlyDigestPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const monthKey = utcMonthKey(opts.createdAt ?? now);
  const monthLabel = payload.monthLabel ?? monthKey;
  const user = await loadUser(db, payload.userId);
  if (!user) return { status: "skipped" };
  const dedupeKey = monthlyDigestJobId(payload.userId, monthKey);
  const recentCategoryCount = await countRecent(
    db,
    payload.userId,
    [MONTHLY_DIGEST_EVENT],
    dedupeKey,
    now,
    MONTHLY_DIGEST_CAP_WINDOW_MS,
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
    ...pushRow(db, payload.userId, MONTHLY_DIGEST_EVENT, dedupeKey),
  });
}
