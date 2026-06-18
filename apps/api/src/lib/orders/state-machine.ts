import { ORDER_DELIVERY_LADDER } from "@worn/shared";
import type { DeliveryTier, OrderState, StateEta } from "@worn/shared";
import { getTierTimings, type EconomyMode } from "@worn/shared";

function resolveEconomyMode(): EconomyMode {
  const raw =
    process.env.WORN_ECONOMY_MODE ??
    (process.env.NODE_ENV === "production" ? "prod" : "beta");
  return raw === "prod" ? "prod" : "beta";
}

export function buildStateEta(placedAt: Date, tier: DeliveryTier): StateEta {
  const timings = getTierTimings(resolveEconomyMode())[tier];
  const eta: StateEta = {
    PROCESSING: placedAt.toISOString(),
  };

  for (const state of ORDER_DELIVERY_LADDER) {
    const key = state as keyof typeof timings;
    if (key in timings) {
      eta[state] = new Date(placedAt.getTime() + timings[key]).toISOString();
    }
  }

  return eta;
}

export function transitionDelayMs(
  fromState: OrderState,
  toState: OrderState,
  tier: DeliveryTier,
  placedAt: Date,
): number {
  const eta = buildStateEta(placedAt, tier);
  const targetIso = eta[toState];
  if (!targetIso) return 0;

  const fromIso =
    fromState === "PROCESSING"
      ? placedAt.toISOString()
      : eta[fromState] ?? placedAt.toISOString();

  return Math.max(0, new Date(targetIso).getTime() - new Date(fromIso).getTime());
}

export function nextState(current: OrderState): OrderState | null {
  if (current === "PROCESSING") return "PACKED";
  const idx = ORDER_DELIVERY_LADDER.indexOf(
    current as (typeof ORDER_DELIVERY_LADDER)[number],
  );
  if (idx < 0) {
    if (current === "DELIVERED") return "REVEAL_READY";
    return null;
  }
  if (idx >= ORDER_DELIVERY_LADDER.length - 1) return null;
  return ORDER_DELIVERY_LADDER[idx + 1] ?? null;
}

export function isValidTransition(current: OrderState, target: OrderState): boolean {
  if (target === "REVEAL_READY") return current === "DELIVERED";
  return nextState(current) === target;
}
