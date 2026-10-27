/**
 * WV02-BALANCE-CHECK — delayed nudge to re-check merchant gift-card balances.
 */
import {
  balanceRecheckCopy,
  balanceRecheckJobId,
  computeBalanceRecheckDelayMs,
  type sendExpoPush,
} from "@worn/shared";
import type { MoneyAccountRecord, Repositories } from "./repositories/types.js";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

export const BALANCE_RECHECK_QUEUE = "credit-balance-recheck";
export const BALANCE_RECHECK_JOB = "credit-balance-recheck-reminder";
export const BALANCE_RECHECK_EVENT = "CREDIT_BALANCE_RECHECK";

export type BalanceRecheckPayload = {
  accountId: string;
  userId: string;
  merchant: string;
  lastCheckedAt: string;
};

export async function scheduleBalanceRecheckReminder(
  account: Pick<
    MoneyAccountRecord,
    "id" | "userId" | "merchant" | "updatedAt" | "status" | "kind"
  >,
  opts: { now?: Date } = {},
): Promise<"published" | "skipped"> {
  if (account.status !== "ACTIVE") return "skipped";
  if (
    account.kind !== "GIFT_CARD" &&
    account.kind !== "STORE_CREDIT" &&
    account.kind !== "LOYALTY_POINTS" &&
    account.kind !== "PROMO_CREDIT"
  ) {
    return "skipped";
  }

  const lastCheckedAt = account.updatedAt;
  const delay = computeBalanceRecheckDelayMs(lastCheckedAt, { now: opts.now });

  const payload: BalanceRecheckPayload = {
    accountId: account.id,
    userId: account.userId,
    merchant: account.merchant,
    lastCheckedAt: new Date(lastCheckedAt).toISOString(),
  };
  // One reminder per (account, check day), like the push dedupe key; a later check gets its own.
  // Throws QueueUnavailableError when Redis can't take it; "skipped" only without Redis off-prod.
  const result = await enqueueJob(BALANCE_RECHECK_QUEUE, BALANCE_RECHECK_JOB, payload, {
    delay,
    jobId: jobIdFrom(balanceRecheckJobId(account.id), payload.lastCheckedAt.slice(0, 10)),
  });
  return result.status === "queued" ? "published" : "skipped";
}

export async function processBalanceRecheckReminder(
  payload: BalanceRecheckPayload,
  repos: Pick<
    Repositories,
    "recordPushEvent" | "findUserById" | "updatePushEventStatus" | "findMoneyAccount"
  >,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const account = await repos.findMoneyAccount(payload.accountId, payload.userId);
  if (!account || account.status !== "ACTIVE") {
    return { status: "skipped" as const, reason: "account_gone" };
  }

  const { runClosetPushDelivery } = await import("@worn/shared");
  const user = await repos.findUserById(payload.userId);
  if (!user) return { status: "skipped" as const, reason: "user_gone" };
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
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: BALANCE_RECHECK_EVENT,
        dedupeKey: `credit-balance-recheck:${payload.accountId}:${payload.lastCheckedAt.slice(0, 10)}`,
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
