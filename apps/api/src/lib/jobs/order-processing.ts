import type { OrderState } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import { isValidTransition } from "../orders/state-machine.js";
import { pushCopyForState, type PushService } from "../push/stub.js";
import { DELIVERY_ARC } from "./order-scheduler.js";

export type OrderTransitionJob = {
  orderId: string;
  targetState: OrderState;
};

/**
 * The steps from `current` up to `target` along the delivery arc, `target` last; just `[target]`
 * when it is the next step, and empty when the order is already there or past it.
 */
function stepsTo(current: OrderState, target: OrderState): OrderState[] {
  const from = DELIVERY_ARC.indexOf(current);
  const to = DELIVERY_ARC.indexOf(target);
  if (from < 0 || to < 0) return isValidTransition(current, target) ? [target] : [];
  return to > from ? DELIVERY_ARC.slice(from + 1, to + 1) : [];
}

export function createOrderTransitionHandler(deps: {
  repos: Repositories;
  push: PushService;
  onDelivered?: (orderId: string) => Promise<void>;
}) {
  return async function handleOrderTransition(job: OrderTransitionJob) {
    const order = await deps.repos.findOrderById(job.orderId);
    if (!order) return;

    // A step that failed earlier (and is still waiting on its retry) left the order behind:
    // this step applies the missed ones first, so the order still arrives on time.
    const steps = stepsTo(order.state, job.targetState);
    if (steps.length === 0) return;

    let from = order.state;
    let updated = null;
    for (const state of steps) {
      updated = await deps.repos.updateOrderState(job.orderId, state, undefined, { from });
      // Moved on by another step meanwhile: that one owns the rest.
      if (!updated) return;
      from = state;
    }
    if (!updated) return;

    // One push, for where the order is now: a step caught up silently isn't news any more.
    const copy = pushCopyForState(job.targetState);
    await deps.push.send({
      userId: updated.userId,
      orderId: updated.id,
      eventType: `ORDER_${job.targetState}`,
      title: copy.title,
      body: copy.body,
    });

    if (job.targetState === "DELIVERED") {
      await deps.onDelivered?.(job.orderId);
    }
  };
}
