/**
 * N13 — Schedule EMI due nudges (BullMQ delayed jobs).
 */
import {
  EMI_NUDGE_LEAD_MS,
  computeEmiNudgeDelayMs,
  emiDueJobId,
  type sendExpoPush,
} from "@worn/shared";
import type { EmiPlanRecord, Repositories } from "./repositories/types.js";

export const EMI_QUEUE = "emi-due";
export const EMI_DUE_JOB = "emi-due-nudge";
export const EMI_DUE_EVENT = "EMI_DUE";

export { computeEmiNudgeDelayMs, emiDueJobId, EMI_NUDGE_LEAD_MS };

export type EmiDuePayload = {
  planId: string;
  userId: string;
  provider: string;
  merchant: string | null;
  remainingMinor: number;
  installmentMinor: number;
  dueOn: string;
  currency: string;
};

export async function scheduleEmiDueNudge(
  plan: Pick<
    EmiPlanRecord,
    | "id"
    | "userId"
    | "provider"
    | "merchant"
    | "remainingMinor"
    | "installmentMinor"
    | "nextDueOn"
    | "currency"
    | "status"
  >,
): Promise<"published" | "skipped"> {
  if (plan.status !== "ACTIVE" || plan.remainingMinor <= 0) return "skipped";
  const redisUrl = process.env.EMI_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";

  const delay = computeEmiNudgeDelayMs(plan.nextDueOn);
  if (delay === null) return "skipped";

  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(EMI_QUEUE, { connection: redisUrl });
    const payload: EmiDuePayload = {
      planId: plan.id,
      userId: plan.userId,
      provider: plan.provider,
      merchant: plan.merchant,
      remainingMinor: plan.remainingMinor,
      installmentMinor: plan.installmentMinor,
      dueOn: plan.nextDueOn,
      currency: plan.currency,
    };
    await queue.add(EMI_DUE_JOB, payload, {
      delay,
      jobId: emiDueJobId(plan.id, plan.nextDueOn),
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[emi] due nudge enqueue failed", String(err));
    return "skipped";
  }
}

export async function processEmiDueNudge(
  payload: EmiDuePayload,
  repos: Pick<Repositories, "recordPushEvent" | "findUserById" | "updatePushEventStatus">,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const { runClosetPushDelivery } = await import("@worn/shared");
  const user = (await repos.findUserById(payload.userId)) ?? {
    consentFlags: {},
    pushToken: null,
  };
  const amount = (payload.installmentMinor / 100).toFixed(0);
  const label = payload.merchant ? `${payload.provider} · ${payload.merchant}` : payload.provider;
  return runClosetPushDelivery({
    eventType: EMI_DUE_EVENT,
    consentFlags: user.consentFlags,
    pushToken: user.pushToken,
    title: `EMI due ${payload.dueOn}`,
    body: `${label}: ₹${amount} installment (₹${(payload.remainingMinor / 100).toFixed(0)} left)`,
    deepLinkExtra: { planId: payload.planId },
    payloadExtra: { ...payload },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: EMI_DUE_EVENT,
        dedupeKey: emiDueJobId(payload.planId, payload.dueOn),
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
