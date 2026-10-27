import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
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
import { pushEvents, users, type Db } from "@worn/db";
import type {
  FoundMoneyWaitingPayload,
  MonthlyDigestPayload,
  WeeklyDigestPayload,
} from "./queues.js";

export type { FoundMoneyWaitingPayload, MonthlyDigestPayload, WeeklyDigestPayload };

export type ClosetPushHandlerOpts = {
  now?: Date;
  sendExpo?: typeof sendExpoPush;
};

const MONTHLY_DIGEST_CAP_WINDOW_MS = 35 * 86_400_000;

async function loadUser(db: Db, userId: string) {
  const [user] = await db
    .select({
      consentFlags: users.consentFlags,
      pushToken: users.pushToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? { consentFlags: {} as Record<string, unknown>, pushToken: null };
}

async function countRecent(
  db: Db,
  userId: string,
  eventTypes: string[],
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
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

export async function processFoundMoneyWaiting(
  payload: FoundMoneyWaitingPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const user = await loadUser(db, payload.userId);
  const recentCategoryCount = await countRecent(
    db,
    payload.userId,
    [FOUND_MONEY_WAITING_EVENT, "CREDIT_EXPIRY"],
    now,
  );

  return deliverFoundMoneyWaiting({
    totalMinor: payload.totalMinor,
    accountCount: payload.accountCount,
    currency: payload.currency,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    recentCategoryCount,
    now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: FOUND_MONEY_WAITING_EVENT,
        dedupeKey: foundMoneyWaitingJobId(payload.userId, utcIsoWeekKey(now)),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  });
}

export async function processWeeklyDigest(
  payload: WeeklyDigestPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const user = await loadUser(db, payload.userId);
  const recentCategoryCount = await countRecent(
    db,
    payload.userId,
    [WEEKLY_DIGEST_EVENT, MONTHLY_DIGEST_EVENT],
    now,
  );

  return deliverWeeklyDigest({
    spendMinor: payload.spendMinor,
    avgCostPerWearMinor: payload.avgCostPerWearMinor,
    currency: payload.currency,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    recentCategoryCount,
    now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: WEEKLY_DIGEST_EVENT,
        dedupeKey: weeklyDigestJobId(payload.userId, utcIsoWeekKey(now)),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  });
}

export async function processMonthlyDigest(
  payload: MonthlyDigestPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const now = opts.now ?? new Date();
  const monthKey = utcMonthKey(now);
  const monthLabel = payload.monthLabel ?? monthKey;
  const user = await loadUser(db, payload.userId);
  const recentCategoryCount = await countRecent(
    db,
    payload.userId,
    [MONTHLY_DIGEST_EVENT],
    now,
    MONTHLY_DIGEST_CAP_WINDOW_MS,
  );

  return deliverMonthlyDigest({
    spendMinor: payload.spendMinor,
    avgCostPerWearMinor: payload.avgCostPerWearMinor,
    monthLabel,
    currency: payload.currency,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    recentCategoryCount,
    now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: MONTHLY_DIGEST_EVENT,
        dedupeKey: monthlyDigestJobId(payload.userId, monthKey),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  });
}
