import {
  ORDER_DELIVERY_LADDER,
  RUSH_TO_EXPRESS_COST_COINS,
  type OrderState,
  type StateEta,
} from "@worn/shared";
import { IN_TRANSIT_ORDER_STATES } from "../jobs/order-scheduler.js";
import type { JobQueue } from "../jobs/queue.js";
import { InsufficientCoinsError } from "../repositories/errors.js";
import type { OrderRecord, Repositories, RushOrderResult } from "../repositories/types.js";
import { buildStateEta } from "./state-machine.js";

export type RushRefusal = "ALREADY_EXPRESS" | "NOT_IN_TRANSIT" | "NO_SPEEDUP";

export type RushPlan = { ok: true; stateEta: StateEta } | { ok: false; reason: RushRefusal };

const REFUSAL_MESSAGES: Record<RushRefusal, string> = {
  ALREADY_EXPRESS: "This order is already on the Express schedule",
  NOT_IN_TRANSIT: "Only orders still on their way can be rushed",
  NO_SPEEDUP: "Express wouldn't get this order to you any sooner",
};

function etaMs(eta: StateEta, state: OrderState): number | undefined {
  const iso = eta[state];
  return iso ? Date.parse(iso) : undefined;
}

/**
 * The order's schedule on Express timings: each delivery step still ahead moves to its
 * Express time when that is earlier (never later), and steps behind keep their times.
 * Refused unless at least one of those steps would actually happen sooner than planned.
 */
export function planRushToExpress(
  order: Pick<OrderRecord, "tier" | "state" | "placedAt" | "stateEta">,
  now = Date.now(),
): RushPlan {
  if (order.tier === "EXPRESS") return { ok: false, reason: "ALREADY_EXPRESS" };
  const position = IN_TRANSIT_ORDER_STATES.indexOf(order.state);
  if (position < 0) return { ok: false, reason: "NOT_IN_TRANSIT" };

  // Same fallback as the scheduler, for steps an order has no stored time for.
  const planned = { ...buildStateEta(order.placedAt, order.tier), ...order.stateEta };
  const express = buildStateEta(order.placedAt, "EXPRESS");
  const stateEta: StateEta = { ...order.stateEta };
  let speedsUp = false;

  for (const step of ORDER_DELIVERY_LADDER.slice(position)) {
    const current = etaMs(planned, step);
    const rushed = etaMs(express, step);
    stateEta[step] = planned[step];
    if (current === undefined || rushed === undefined || !(rushed < current)) continue;

    stateEta[step] = express[step];
    // A step that's already due happens now either way.
    if (current > now) speedsUp = true;
  }

  return speedsUp ? { ok: true, stateEta } : { ok: false, reason: "NO_SPEEDUP" };
}

export class RushError extends Error {
  constructor(
    readonly code: RushRefusal | "ORDER_CHANGED" | "NOT_FOUND" | "INSUFFICIENT_COINS",
    message: string,
  ) {
    super(message);
    this.name = "RushError";
  }
}

export type RushDeps = {
  repos: Repositories;
  jobQueue: JobQueue;
};

// A delivery step landing between our read and the atomic write sends us round again;
// the ladder only has a few steps, so this is plenty.
const MAX_ATTEMPTS = ORDER_DELIVERY_LADDER.length + 1;

/** Pays RUSH_TO_EXPRESS_COST_COINS to put the user's in-transit order on Express timings. */
export async function rushOrderToExpress(
  deps: RushDeps,
  input: { userId: string; orderId: string },
): Promise<RushOrderResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const order = await deps.repos.findOrderById(input.orderId);
    if (!order || order.userId !== input.userId) {
      throw new RushError("NOT_FOUND", "Order not found");
    }

    const plan = planRushToExpress(order);
    if (!plan.ok) throw new RushError(plan.reason, REFUSAL_MESSAGES[plan.reason]);

    let rushed: RushOrderResult | null;
    try {
      rushed = await deps.repos.rushOrderToExpress({
        userId: input.userId,
        orderId: order.id,
        costCoins: RUSH_TO_EXPRESS_COST_COINS,
        from: order.state,
        stateEta: plan.stateEta,
      });
    } catch (error) {
      if (error instanceof InsufficientCoinsError) {
        throw new RushError(
          "INSUFFICIENT_COINS",
          `Rushing to Express costs ${RUSH_TO_EXPRESS_COST_COINS} coins`,
        );
      }
      throw error;
    }

    if (rushed) {
      // Arms the earlier times; the old timers find the order already moved on.
      await deps.jobQueue.scheduleOrderLadder(order.id);
      return rushed;
    }
    // The order moved on, or was rushed, since we read it: look again.
  }

  throw new RushError("ORDER_CHANGED", "This order is changing right now; try again");
}
