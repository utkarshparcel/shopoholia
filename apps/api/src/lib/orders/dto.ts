import { RUSH_TO_EXPRESS_COST_COINS } from "@worn/shared";
import type { OrderRecord } from "../repositories/types.js";
import { planRushToExpress } from "./rush.js";

export function orderSummaryDto(order: OrderRecord) {
  return {
    id: order.id,
    tier: order.tier,
    state: order.state,
    coinTotal: order.coinTotal,
    placedAt: order.placedAt.toISOString(),
    stateEta: order.stateEta,
    rushAvailable: planRushToExpress(order).ok,
    rushCostCoins: RUSH_TO_EXPRESS_COST_COINS,
  };
}
