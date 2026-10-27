import type { sendExpoPush } from "@worn/shared";
import type { CoolingOffHold } from "./cooling-off.js";

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

export async function scheduleCoolingOffRelease(
  payload: CoolingOffReleasePayload,
): Promise<"published" | "skipped"> {
  const redisUrl = process.env.COOLING_OFF_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";
  const delay = computeCoolingOffReleaseDelayMs(payload.releaseAt);
  if (delay === null) return "skipped";
  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(COOLING_OFF_QUEUE, { connection: redisUrl });
    await queue.add(COOLING_OFF_JOB, payload, {
      delay,
      jobId: `cooling-off:${payload.userId}:${payload.cartFingerprint}`,
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[cooling-off] release enqueue failed", String(err));
    return "skipped";
  }
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
 * (allow once) until a successful order clears it.
 */
export async function processCoolingOffRelease(
  payload: CoolingOffReleasePayload,
  repos: {
    recordPushEvent: (input: Record<string, unknown>) => Promise<{ id: string }>;
    findUserById?: (id: string) => Promise<{
      consentFlags?: Record<string, unknown>;
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

  const user = (await repos.findUserById?.(payload.userId)) ?? {
    consentFlags: {},
    pushToken: null,
  };

  const copy = coolingOffReleaseCopy(payload.category);
  return runClosetPushDelivery({
    eventType: "cooling_off_released",
    consentFlags: user.consentFlags,
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
      return { id: event.id };
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
