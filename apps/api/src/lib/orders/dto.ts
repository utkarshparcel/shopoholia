import type { OrderRecord } from "../repositories/types.js";

export function orderSummaryDto(order: OrderRecord) {
  return {
    id: order.id,
    tier: order.tier,
    state: order.state,
    coinTotal: order.coinTotal,
    placedAt: order.placedAt.toISOString(),
    stateEta: order.stateEta,
  };
}
