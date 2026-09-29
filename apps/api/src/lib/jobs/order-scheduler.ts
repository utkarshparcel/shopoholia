import { ORDER_DELIVERY_LADDER, type OrderState } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import { buildStateEta } from "../orders/state-machine.js";
import type { OrderTransitionJob } from "./order-processing.js";

/** Checkout state followed by the timer-driven steps, in order. */
const DELIVERY_ARC: readonly OrderState[] = ["PROCESSING", ...ORDER_DELIVERY_LADDER];

/** States whose next step is still waiting on a delivery timer. */
export const IN_TRANSIT_ORDER_STATES: readonly OrderState[] = DELIVERY_ARC.slice(0, -1);

/**
 * Schedules the delivery steps still ahead of the order, each at its stateEta time.
 * Steps already due (for example after a restart) are scheduled with no delay.
 */
export async function scheduleOrderLadderJobs(
  repos: Repositories,
  orderId: string,
  enqueue: (job: OrderTransitionJob, delayMs: number) => Promise<void>,
  now = Date.now(),
) {
  const order = await repos.findOrderById(orderId);
  if (!order) return;

  const position = DELIVERY_ARC.indexOf(order.state);
  if (position < 0) return;

  const fallbackEta = buildStateEta(order.placedAt, order.tier);
  for (const targetState of ORDER_DELIVERY_LADDER.slice(position)) {
    const eta = order.stateEta[targetState] ?? fallbackEta[targetState];
    const delayMs = eta ? Math.max(0, Date.parse(eta) - now) : 0;
    await enqueue({ orderId, targetState }, delayMs);
  }
}
