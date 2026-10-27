import type { sendExpoPush } from "@worn/shared";
import { readCoolingOffFromFlags, type CoolingOffHold } from "./cooling-off.js";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";
import type { RecordPushEventInput } from "./repositories/types.js";

export const COOLING_OFF_QUEUE = "cooling-off-release";
export const COOLING_OFF_JOB = "cooling-off-released";

export type CoolingOffReleasePayload = {
  userId: string;
  releaseAt: string;
  category: string;
  cartFingerprint: string;
};

/** Delay until the hold releases; null when already released. */
export function computeCoolingOffReleaseDelayMs(
  releaseAt: Date | string,
  nowMs: number = Date.now(),
): number | null {
  const delayMs = new Date(releaseAt).getTime() - nowMs;
  if (delayMs <= 0) return null;
  return delayMs;
}

/**
 * Enqueues the hold-released push. Throws QueueUnavailableError when Redis can't take the job
 * (or REDIS_URL is unset in production); "skipped" means the hold already ended, or no Redis
 * outside production.
 */
export async function scheduleCoolingOffRelease(
  payload: CoolingOffReleasePayload,
): Promise<"published" | "skipped"> {
  const delay = computeCoolingOffReleaseDelayMs(payload.releaseAt);
  if (delay === null) return "skipped";
  const result = await enqueueJob(COOLING_OFF_QUEUE, COOLING_OFF_JOB, payload, {
    delay,
    jobId: jobIdFrom("cooling-off", payload.userId, payload.cartFingerprint, payload.releaseAt),
  });
  return result.status === "queued" ? "published" : "skipped";
}

export function coolingOffReleaseCopy(category: string): { title: string; body: string } {
  return {
    title: "Cooling-off ended",
    body: `Your ${category} haul hold is up — you can check out when ready.`,
  };
}

/**
 * Processor: notify that the 24h soft lock has released.
 * Leaves the expired hold flag in place so checkout can treat it as hold_expired
 * (allow once) until a successful order clears it. Skips when that hold is gone or was
 * replaced (the user checked out or overrode it), so a rerun or a late job never nags.
 */
export async function processCoolingOffRelease(
  payload: CoolingOffReleasePayload,
  repos: {
    recordPushEvent: (
      input: RecordPushEventInput,
    ) => Promise<{ id: string; status?: "QUEUED" | "SENT" | "FAILED" }>;
    findUserById: (id: string) => Promise<{
      consentFlags?: Record<string, unknown> | null;
      prefs?: Record<string, unknown> | null;
      timeZone?: string | null;
      pushToken?: string | null;
    } | null>;
    updatePushEventStatus?: (
      id: string,
      status: "SENT" | "FAILED",
      expoTicketId?: string | null,
    ) => Promise<void>;
  },
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const { runClosetPushDelivery } = await import("@worn/shared");

  const user = await repos.findUserById(payload.userId);
  // Account erased since the hold started: nobody to tell.
  if (!user) return { status: "skipped" as const };
  // checkout.ts keeps the hold in consentFlags and clears it on a placed order or an override.
  const hold = readCoolingOffFromFlags(user.consentFlags);
  if (!hold || hold.releaseAt !== payload.releaseAt) return { status: "skipped" as const };

  const copy = coolingOffReleaseCopy(payload.category);
  return runClosetPushDelivery({
    eventType: "cooling_off_released",
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: copy.title,
    body: copy.body,
    deepLinkExtra: {},
    payloadExtra: {
      category: payload.category,
      releaseAt: payload.releaseAt,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: "cooling_off_released",
        dedupeKey: `cooling-off-released:${payload.userId}:${payload.releaseAt}`,
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

export function holdToReleasePayload(
  userId: string,
  hold: CoolingOffHold,
): CoolingOffReleasePayload {
  return {
    userId,
    releaseAt: hold.releaseAt,
    category: hold.category,
    cartFingerprint: hold.cartFingerprint,
  };
}
