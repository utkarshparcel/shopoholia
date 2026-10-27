export const TAILORING_QUEUE = "tailoring-orders";
export const TAILORING_JOB = "tailoring-state-transition";

export type TailoringPayload = {
  orderId: string;
  userId: string;
};

// Ladder: PENDING -> CONFIRMED (1h) -> IN_STITCHING (2h) -> SHIPPED (24h) -> DELIVERED
const TAILORING_LADDER: Array<{ from: string; to: string; delayMs: number }> = [
  { from: "PENDING", to: "CONFIRMED", delayMs: 60 * 60 * 1000 },
  { from: "CONFIRMED", to: "IN_STITCHING", delayMs: 2 * 60 * 60 * 1000 },
  { from: "IN_STITCHING", to: "SHIPPED", delayMs: 24 * 60 * 60 * 1000 },
  { from: "SHIPPED", to: "DELIVERED", delayMs: 48 * 60 * 60 * 1000 },
];

export function nextTailorState(state: string): { next: string; delayMs: number } | null {
  const entry = TAILORING_LADDER.find((e) => e.from === state);
  if (!entry) return null;
  return { next: entry.to, delayMs: entry.delayMs };
}

export async function scheduleTailoringTransitions(payload: TailoringPayload): Promise<"published" | "skipped"> {
  const redisUrl = process.env.TAILORING_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";
  const next = nextTailorState("PENDING");
  if (!next) return "skipped";
  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(TAILORING_QUEUE, { connection: redisUrl });
    await queue.add(TAILORING_JOB, payload, { delay: next.delayMs, jobId: `tailor:${payload.orderId}:${next.next}` });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[tailoring] enqueue failed", String(err));
    return "skipped";
  }
}

export async function scheduleNextTailoring(
  currentState: string,
  payload: TailoringPayload,
): Promise<"published" | "skipped"> {
  const redisUrl = process.env.TAILORING_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";
  const next = nextTailorState(currentState);
  if (!next) return "skipped";
  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(TAILORING_QUEUE, { connection: redisUrl });
    await queue.add(TAILORING_JOB, payload, { delay: next.delayMs, jobId: `tailor:${payload.orderId}:${next.next}` });
    await queue.close();
    return "published";
  } catch {
    return "skipped";
  }
}

export async function processTailoringTransition(
  payload: TailoringPayload,
  repos: {
    findTailoringOrder: (
      id: string,
      userId: string,
    ) => Promise<{ id: string; state: string; tailorSellerId?: string | null } | null>;
    updateTailoringOrderState: (id: string, state: string) => Promise<{ id: string } | null>;
    recordPushEvent: (input: Record<string, unknown>) => Promise<unknown>;
  },
) {
  const order = await repos.findTailoringOrder(payload.orderId, payload.userId);
  if (!order) return;
  const next = nextTailorState(order.state);
  if (!next) return;
  const updated = await repos.updateTailoringOrderState(order.id, next.next);
  if (!updated) return;
  if (next.next === "DELIVERED") {
    const { settleCompletedOrder, DEFAULT_TAILORING_ORDER_MINOR } = await import("./take-rate.js");
    settleCompletedOrder({
      kind: "tailoring",
      orderRef: `tailor:${order.id}`,
      sellerId: order.tailorSellerId ?? "tailor-unassigned",
      orderAmountMinor: DEFAULT_TAILORING_ORDER_MINOR,
    });
  }
  await repos.recordPushEvent({
    userId: payload.userId,
    orderId: null,
    eventType: "tailoring_update",
    dedupeKey: `tailoring:${order.id}:${next.next}`,
    title: `Tailoring ${next.next}`,
    body: `Your tailoring order is now ${next.next}`,
    payload: { deepLink: `worn://fit/orders/${order.id}`, screen: "order" as const, orderId: order.id },
    status: "QUEUED",
  });
  await scheduleNextTailoring(next.next, payload);
}
