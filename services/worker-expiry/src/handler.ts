import { and, eq } from "drizzle-orm";
import {
  balanceRecheckCopy,
  cashbackClaimReminderJobId,
  resolveTimeZone,
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import {
  cashbackClaims,
  moneyAccounts,
  pushEvents,
  recordPushEventIfNew,
  users,
  warranties,
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
      prefs: users.prefs,
      timeZone: users.timeZone,
      pushToken: users.pushToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

/** A date on the user's wall clock ("28 Aug"), not the server's. */
function localDate(iso: string, timeZone: string | null | undefined): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: resolveTimeZone(timeZone),
  });
}

function sameInstant(a: Date | null, iso: string): boolean {
  return a !== null && a.getTime() === new Date(iso).getTime();
}

/** push_events writes for runClosetPushDelivery: one row per dedupe key, safe to run twice. */
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

/**
 * Writes a `push_events` row reminding the user that a gift card / store
 * credit is about to expire, then delivers via the shared Expo send path.
 * Skips when the credit was used up, closed or its expiry changed (that has its own job).
 */
export async function processExpiry(
  payload: CreditExpiryPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<ProcessPushResult> {
  const [account] = await db
    .select({ status: moneyAccounts.status, expiresAt: moneyAccounts.expiresAt })
    .from(moneyAccounts)
    .where(and(eq(moneyAccounts.id, payload.accountId), eq(moneyAccounts.userId, payload.userId)))
    .limit(1);
  if (!account || account.status !== "ACTIVE" || !sameInstant(account.expiresAt, payload.expiresAt)) {
    return { status: "skipped" };
  }
  const user = await loadUser(db, payload.userId);
  if (!user) return { status: "skipped" };
  const title = `${payload.merchant} credit expires soon`;
  const body = `Your ${payload.merchant} gift card or store credit expires on ${localDate(
    payload.expiresAt,
    user.timeZone,
  )}. Use it before it's gone.`;
  const snooze = payload.snoozedUntil ? `:snooze:${payload.snoozedUntil}` : "";

  return runClosetPushDelivery({
    eventType: CREDIT_EXPIRY_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
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
    ...pushRow(
      db,
      payload.userId,
      CREDIT_EXPIRY_EVENT,
      `credit-expiry:${payload.accountId}:${payload.expiresAt}${snooze}`,
    ),
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
  const [warranty] = await db
    .select({ coverageUntil: warranties.coverageUntil })
    .from(warranties)
    .where(and(eq(warranties.id, payload.warrantyId), eq(warranties.userId, payload.userId)))
    .limit(1);
  if (!warranty || !sameInstant(warranty.coverageUntil, payload.coverageUntil)) {
    return { status: "skipped" };
  }
  const user = await loadUser(db, payload.userId);
  if (!user) return { status: "skipped" };
  const title = `Warranty for ${payload.itemTitle} expires soon`;
  const body = `Your ${payload.provider} warranty on ${payload.itemTitle} expires on ${localDate(
    payload.coverageUntil,
    user.timeZone,
  )}. File a claim before it lapses.`;
  const snooze = payload.snoozedUntil ? `:snooze:${payload.snoozedUntil}` : "";

  return runClosetPushDelivery({
    eventType: WARRANTY_EXPIRY_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
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
    ...pushRow(
      db,
      payload.userId,
      WARRANTY_EXPIRY_EVENT,
      `warranty-expiry:${payload.warrantyId}:${payload.coverageUntil}${snooze}`,
    ),
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
  if (!user) return { status: "skipped", reason: "account_gone" };
  const copy = balanceRecheckCopy(payload.merchant);

  return runClosetPushDelivery({
    eventType: BALANCE_RECHECK_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
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
    ...pushRow(
      db,
      payload.userId,
      BALANCE_RECHECK_EVENT,
      `credit-balance-recheck:${payload.accountId}:${payload.lastCheckedAt.slice(0, 10)}`,
    ),
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
  if (!user) return { status: "skipped", reason: "claim_gone" };
  const amount = (payload.amountMinor / 100).toFixed(0);
  const label = payload.merchant
    ? `${payload.source} · ${payload.merchant}`
    : payload.source;

  return runClosetPushDelivery({
    eventType: CASHBACK_CLAIM_DEADLINE_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: "Cashback claim due soon",
    body: `${label}: ₹${amount} — claim before it lapses`,
    deepLinkExtra: { claimId: payload.claimId },
    payloadExtra: { ...payload },
    now: opts.now,
    sendExpo: opts.sendExpo,
    ...pushRow(
      db,
      payload.userId,
      CASHBACK_CLAIM_DEADLINE_EVENT,
      cashbackClaimReminderJobId(payload.claimId),
    ),
  });
}
