import type { PushService } from "../push/stub.js";
import { checkAndMarkRevealReady } from "../render/pipeline.js";
import type { Repositories } from "../repositories/types.js";
import { IN_TRANSIT_ORDER_STATES } from "./order-scheduler.js";
import type { JobQueue } from "./queue.js";

export type ResumeSummary = {
  ordersInTransit: number;
  deliveredOrders: number;
  renders: number;
};

/**
 * Delivery timers and queued render jobs live in process memory, so a restart drops
 * them. Re-arm everything the database says is still in flight. Run once at startup,
 * before the server takes traffic.
 */
export async function resumeInFlightWork(deps: {
  repos: Repositories;
  jobQueue: JobQueue;
  push: PushService;
}): Promise<ResumeSummary> {
  // Renders first, so the ones seeded for delivered orders below aren't queued twice.
  const pending = await deps.repos.listPendingRenders();
  for (const { render, orderId } of pending) {
    if (render.status === "RUNNING") {
      // Cut off mid-generation by the restart; generate it again.
      await deps.repos.updateRender(render.id, { status: "QUEUED" });
    }
    await deps.jobQueue.enqueueRender({ renderId: render.id, orderId });
  }

  const delivered = await deps.repos.listOrdersByStates(["DELIVERED"]);
  for (const order of delivered) {
    const renders = await deps.repos.findRendersByOrderId(order.id);
    if (renders.length === 0) {
      // Restarted before the order's reveal renders were created.
      await deps.jobQueue.enqueueDeliveredRender({ orderId: order.id });
    } else {
      // No-op unless every free render finished before the order moved on.
      await checkAndMarkRevealReady({ repos: deps.repos, push: deps.push, orderId: order.id });
    }
  }

  const inTransit = await deps.repos.listOrdersByStates(IN_TRANSIT_ORDER_STATES);
  for (const order of inTransit) {
    await deps.jobQueue.scheduleOrderLadder(order.id);
  }

  return {
    ordersInTransit: inTransit.length,
    deliveredOrders: delivered.length,
    renders: pending.length,
  };
}
