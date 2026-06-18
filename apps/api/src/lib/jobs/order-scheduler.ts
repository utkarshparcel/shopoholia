import { ORDER_DELIVERY_LADDER } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import { transitionDelayMs } from "../orders/state-machine.js";
import type { OrderTransitionJob } from "./order-processing.js";

export function scheduleOrderLadderJobs(
  repos: Repositories,
  orderId: string,
  enqueue: (job: OrderTransitionJob, delayMs: number) => Promise<void>,
) {
  return repos.findOrderById(orderId).then(async (order) => {
    if (!order) return;

    let fromState = order.state;
    for (const targetState of ORDER_DELIVERY_LADDER) {
      const delayMs = transitionDelayMs(fromState, targetState, order.tier, order.placedAt);
      await enqueue({ orderId, targetState }, delayMs);
      fromState = targetState;
    }
  });
}
