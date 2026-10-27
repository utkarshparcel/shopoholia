import { RUSH_TO_EXPRESS_COST_COINS, type DuplicateWarningResult } from "@worn/shared";
import type { OrderRecord } from "../repositories/types.js";
import type { BudgetNudgePayload } from "../budget.js";
import { planRushToExpress } from "./rush.js";

export function orderSummaryDto(
  order: OrderRecord,
  extras?: {
    budgetNudge?: BudgetNudgePayload | null;
    trackedInCloset?: boolean;
    duplicateWarnings?: DuplicateWarningResult[];
  },
) {
  return {
    id: order.id,
    tier: order.tier,
    state: order.state,
    coinTotal: order.coinTotal,
    placedAt: order.placedAt.toISOString(),
    stateEta: order.stateEta,
    rushAvailable: planRushToExpress(order).ok,
    rushCostCoins: RUSH_TO_EXPRESS_COST_COINS,
    ...(extras?.budgetNudge !== undefined ? { budgetNudge: extras.budgetNudge } : {}),
    ...(extras?.trackedInCloset !== undefined
      ? { trackedInCloset: extras.trackedInCloset }
      : {}),
    ...(extras?.duplicateWarnings !== undefined && extras.duplicateWarnings.length > 0
      ? { duplicateWarnings: extras.duplicateWarnings }
      : {}),
  };
}
