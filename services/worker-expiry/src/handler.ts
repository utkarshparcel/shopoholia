import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  balanceRecheckCopy,
  cashbackClaimReminderJobId,
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import {
  cashbackClaims,
  moneyAccounts,
  pushEvents,
  users,
  type Db,
} from "@worn/db";
import type {
  BalanceRecheckPayload,
  CashbackClaimDeadlinePayload,
  CreditExpiryPayload,
  WarrantyExpiryPayload,
} from "./queues.js";

export const CREDIT_EXPIRY_EVENT = "CREDIT_EXPIRY";
export const WARRANTY_EXPIRY_EVENT = "WARRANTY_EXPIRY";
export const BALANCE_RECHECK_EVENT = "CREDIT_BALANCE_RECHECK";
export const CASHBACK_CLAIM_DEADLINE_EVENT = "CASHBACK_CLAIM_DEADLINE";

export type ClosetPushHandlerOpts = {
  now?: Date;
  sendExpo?: typeof sendExpoPush;
};

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

/**
 * Writes a `push_events` row reminding the user that a gift card / store
 * credit is about to expire, then delivers via the shared Expo send path.
 */
export async function processExpiry(
  payload: CreditExpiryPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const user = await loadUser(db, payload.userId);
  const title = `${payload.merchant} credit expires soon`;
  const body = `Your ${payload.merchant} gift card or store credit expires on ${new Date(
    payload.expiresAt,
  ).toLocaleDateString()}. Use it before it's gone.`;

  return runClosetPushDelivery({
    eventType: CREDIT_EXPIRY_EVENT,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    title,
    body,
    deepLinkExtra: { accountId: payload.accountId },
    payloadExtra: {
      accountId: payload.accountId,
      merchant: payload.merchant,
      expiresAt: payload.expiresAt,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title: t, body: b, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: CREDIT_EXPIRY_EVENT,
        dedupeKey: `credit-expiry:${payload.accountId}`,
        title: t,
        body: b,
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

/**
 * Writes a `push_events` row reminding the user that a warranty is about to
 * expire. Mirrors `processExpiry` for the warranty-expiry queue.
 */
export async function processWarrantyExpiry(
  payload: WarrantyExpiryPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const user = await loadUser(db, payload.userId);
  const title = `Warranty for ${payload.itemTitle} expires soon`;
  const body = `Your ${payload.provider} warranty on ${payload.itemTitle} expires on ${new Date(
    payload.coverageUntil,
  ).toLocaleDateString()}. File a claim before it lapses.`;

  return runClosetPushDelivery({
    eventType: WARRANTY_EXPIRY_EVENT,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    title,
    body,
    deepLinkExtra: { warrantyId: payload.warrantyId },
    payloadExtra: {
      warrantyId: payload.warrantyId,
      itemTitle: payload.itemTitle,
      provider: payload.provider,
      coverageUntil: payload.coverageUntil,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title: t, body: b, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: WARRANTY_EXPIRY_EVENT,
        dedupeKey: `warranty-expiry:${payload.warrantyId}`,
        title: t,
        body: b,
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

/**
 * WV02-BALANCE-CHECK — remind the user to re-check a merchant gift-card /
 * store-credit balance when no live API refresh is available (or on cadence
 * after an API refresh).
 */
export async function processBalanceRecheck(
  payload: BalanceRecheckPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult | { status: "skipped"; reason: "account_gone" }> {
  const [account] = await db
    .select({ id: moneyAccounts.id, status: moneyAccounts.status })
    .from(moneyAccounts)
    .where(
      and(
        eq(moneyAccounts.id, payload.accountId),
        eq(moneyAccounts.userId, payload.userId),
      ),
    )
    .limit(1);
  if (!account || account.status !== "ACTIVE") {
    return { status: "skipped", reason: "account_gone" };
  }

  const user = await loadUser(db, payload.userId);
  const copy = balanceRecheckCopy(payload.merchant);

  return runClosetPushDelivery({
    eventType: BALANCE_RECHECK_EVENT,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    title: copy.title,
    body: copy.body,
    deepLinkExtra: { accountId: payload.accountId },
    payloadExtra: {
      accountId: payload.accountId,
      merchant: payload.merchant,
      lastCheckedAt: payload.lastCheckedAt,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title: t, body: b, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: BALANCE_RECHECK_EVENT,
        dedupeKey: `credit-balance-recheck:${payload.accountId}:${payload.lastCheckedAt.slice(0, 10)}`,
        title: t,
        body: b,
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

/**
 * U006 — T-3d nudge for unclaimed cashback before the claim-before date.
 * Skips if the claim was already claimed/expired or deleted.
 */
export async function processCashbackClaimDeadline(
  payload: CashbackClaimDeadlinePayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<
  ProcessPushResult | { status: "skipped"; reason: "claim_gone" | "not_unclaimed" }
> {
  const [claim] = await db
    .select({
      id: cashbackClaims.id,
      status: cashbackClaims.status,
    })
    .from(cashbackClaims)
    .where(
      and(
        eq(cashbackClaims.id, payload.claimId),
        eq(cashbackClaims.userId, payload.userId),
      ),
    )
    .limit(1);
  if (!claim) {
    return { status: "skipped", reason: "claim_gone" };
  }
  if (claim.status !== "UNCLAIMED") {
    return { status: "skipped", reason: "not_unclaimed" };
  }

  const user = await loadUser(db, payload.userId);
  const amount = (payload.amountMinor / 100).toFixed(0);
  const label = payload.merchant
    ? `${payload.source} · ${payload.merchant}`
    : payload.source;

  return runClosetPushDelivery({
    eventType: CASHBACK_CLAIM_DEADLINE_EVENT,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    title: "Cashback claim due soon",
    body: `${label}: ₹${amount} — claim before it lapses`,
    deepLinkExtra: { claimId: payload.claimId },
    payloadExtra: { ...payload },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title: t, body: b, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: CASHBACK_CLAIM_DEADLINE_EVENT,
        dedupeKey: cashbackClaimReminderJobId(payload.claimId),
        title: t,
        body: b,
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
