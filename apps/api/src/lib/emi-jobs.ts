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
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

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

  const delay = computeEmiNudgeDelayMs(plan.nextDueOn);
  if (delay === null) return "skipped";

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
  // Throws QueueUnavailableError when Redis can't take it; "skipped" only without Redis off-prod.
  const result = await enqueueJob(EMI_QUEUE, EMI_DUE_JOB, payload, {
    delay,
    jobId: jobIdFrom(emiDueJobId(plan.id, plan.nextDueOn)),
  });
  return result.status === "queued" ? "published" : "skipped";
}

/**
 * Sends the EMI-due push unless the plan was paid, closed or moved to another due date since
 * the job was queued. Safe to run twice: the push row is keyed on (plan, due date).
 */
export async function processEmiDueNudge(
  payload: EmiDuePayload,
  repos: Pick<
    Repositories,
    "recordPushEvent" | "findUserById" | "updatePushEventStatus" | "findEmiPlan"
  >,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const { runClosetPushDelivery } = await import("@worn/shared");
  const plan = await repos.findEmiPlan(payload.planId, payload.userId);
  if (
    !plan ||
    plan.status !== "ACTIVE" ||
    plan.remainingMinor <= 0 ||
    plan.nextDueOn !== payload.dueOn
  ) {
    return { status: "skipped" as const };
  }
  const user = await repos.findUserById(payload.userId);
  if (!user) return { status: "skipped" as const };
  const amount = (payload.installmentMinor / 100).toFixed(0);
  const label = payload.merchant ? `${payload.provider} · ${payload.merchant}` : payload.provider;
  return runClosetPushDelivery({
    eventType: EMI_DUE_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
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
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}
