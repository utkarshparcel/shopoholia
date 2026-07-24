import type { OrderState } from "@worn/shared";
import type { Repositories } from "../repositories/types.js";
import { isValidTransition } from "../orders/state-machine.js";
import { pushCopyForState, type PushService } from "../push/stub.js";

export type OrderTransitionJob = {
  orderId: string;
  targetState: OrderState;
};

export function createOrderTransitionHandler(deps: {
  repos: Repositories;
  push: PushService;
  onDelivered?: (orderId: string) => Promise<void>;
}) {
  return async function handleOrderTransition(job: OrderTransitionJob) {
    const order = await deps.repos.findOrderById(job.orderId);
    if (!order) return;

    if (order.state === job.targetState) return;
    if (!isValidTransition(order.state, job.targetState)) return;

    const updated = await deps.repos.updateOrderState(job.orderId, job.targetState);
    if (!updated) return;

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
