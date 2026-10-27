/**
 * U006 — Schedule cashback claim deadline nudges (T-3d).
 * Manual claim tracker only — not a bank partner or auto-filer.
 */
import {
  CASHBACK_CLAIM_LEAD_MS,
  cashbackClaimReminderJobId,
  type sendExpoPush,
} from "@worn/shared";
import { computeExpiryDelayMs } from "./expiry.js";
import type { CashbackClaimRecord, Repositories } from "./repositories/types.js";

export const CASHBACK_CLAIM_QUEUE = "cashback-claim-deadline";
export const CASHBACK_CLAIM_JOB = "cashback-claim-deadline-reminder";
export const CASHBACK_CLAIM_DEADLINE_EVENT = "CASHBACK_CLAIM_DEADLINE";

export { CASHBACK_CLAIM_LEAD_MS, cashbackClaimReminderJobId };

export type CashbackClaimDeadlinePayload = {
  claimId: string;
  userId: string;
  source: string;
  merchant: string | null;
  amountMinor: number;
  currency: string;
  expiresAt: string;
};

export async function scheduleCashbackClaimReminder(
  claim: Pick<
    CashbackClaimRecord,
    "id" | "userId" | "source" | "merchant" | "amountMinor" | "currency" | "expiresAt" | "status"
  >,
): Promise<"published" | "skipped"> {
  if (claim.status !== "UNCLAIMED" || !claim.expiresAt) return "skipped";
  const redisUrl = process.env.CASHBACK_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";

  const delay = computeExpiryDelayMs(claim.expiresAt, CASHBACK_CLAIM_LEAD_MS);
  if (delay === null) return "skipped";

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(CASHBACK_CLAIM_QUEUE, { connection: redisUrl });
    const payload: CashbackClaimDeadlinePayload = {
      claimId: claim.id,
      userId: claim.userId,
      source: claim.source,
      merchant: claim.merchant,
      amountMinor: claim.amountMinor,
      currency: claim.currency,
      expiresAt: new Date(claim.expiresAt).toISOString(),
    };
    await queue.add(CASHBACK_CLAIM_JOB, payload, {
      delay,
      jobId: cashbackClaimReminderJobId(claim.id),
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[cashback] claim deadline enqueue failed", String(err));
    return "skipped";
  }
}

export async function processCashbackClaimDeadline(
  payload: CashbackClaimDeadlinePayload,
  repos: Pick<Repositories, "recordPushEvent" | "findUserById" | "updatePushEventStatus">,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const { runClosetPushDelivery } = await import("@worn/shared");
  const user = (await repos.findUserById(payload.userId)) ?? {
    consentFlags: {},
    pushToken: null,
  };
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
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: CASHBACK_CLAIM_DEADLINE_EVENT,
        dedupeKey: cashbackClaimReminderJobId(payload.claimId),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id: event.id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}
