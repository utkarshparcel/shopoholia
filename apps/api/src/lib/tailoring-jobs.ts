import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";

export const TAILORING_QUEUE = "tailoring-orders";
export const TAILORING_JOB = "tailoring-state-transition";

export type TailoringPayload = {
  orderId: string;
  userId: string;
  /** The state this job moves the order to. It only moves an order still in the step before it. */
  toState?: string;
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

/**
 * The ladder is a timed simulation of a tailor's progress: no tailor partner reports status yet.
 * It runs only outside production, so a real order is never told "shipped" on a timer.
 */
export function tailoringLadderEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function tailoringJobId(orderId: string, toState: string): string {
  return jobIdFrom(`tailor:${orderId}:${toState}`);
}

export async function scheduleTailoringTransitions(payload: TailoringPayload): Promise<"published" | "skipped"> {
  return scheduleNextTailoring("PENDING", payload);
}

/** Throws QueueUnavailableError when Redis can't take the job. */
export async function scheduleNextTailoring(
  currentState: string,
  payload: TailoringPayload,
): Promise<"published" | "skipped"> {
  if (!tailoringLadderEnabled()) {
    console.info("[tailoring] simulated status ladder is off in production", {
      orderId: payload.orderId,
    });
    return "skipped";
  }
  const next = nextTailorState(currentState);
  if (!next) return "skipped";
  const result = await enqueueJob(
    TAILORING_QUEUE,
    TAILORING_JOB,
    { orderId: payload.orderId, userId: payload.userId, toState: next.next },
    { delay: next.delayMs, jobId: tailoringJobId(payload.orderId, next.next) },
  );
  return result.status === "queued" ? "published" : "skipped";
}

/**
 * Safe to run twice: a rerun finds the order already at the target and only repeats the
 * idempotent writes (push dedupe key, settlement keyed on the order, next job keyed on its id).
 */
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
  // Jobs from before toState existed move whatever step the order is on.
  const step = payload.toState
    ? TAILORING_LADDER.find((e) => e.to === payload.toState)
    : TAILORING_LADDER.find((e) => e.from === order.state);
  if (!step) return;
  if (order.state === step.from) {
    const updated = await repos.updateTailoringOrderState(order.id, step.to);
    if (!updated) return;
  } else if (order.state !== step.to) {
    // Moved on (or marked received) since this job was scheduled.
    return;
  }
  if (step.to === "DELIVERED") {
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
    dedupeKey: `tailoring:${order.id}:${step.to}`,
    title: `Tailoring ${step.to}`,
    body: `Your tailoring order is now ${step.to}`,
    payload: { deepLink: `worn://fit/orders/${order.id}`, screen: "order" as const, orderId: order.id },
    status: "QUEUED",
  });
  await scheduleNextTailoring(step.to, payload);
}
