import type { BudgetNudgePayload } from "./budget.js";

/** 24h soft cart hold when apparel spend would exceed budget (N34). */
export const COOLING_OFF_MS = 24 * 60 * 60 * 1000;

/** Consent / user flag key storing the active hold. */
export const COOLING_OFF_FLAG_KEY = "coolingOff";

export type CoolingOffHold = {
  heldAt: string;
  releaseAt: string;
  category: string;
  projectedMinor: number;
  limitMinor: number;
  /** Stable id of the haul that triggered the hold (informational). */
  cartFingerprint: string;
};

export type CoolingOffDecision =
  | { action: "allow"; reason: "under_budget" | "override" | "hold_expired" | "no_apparel_overage" }
  | { action: "soft_lock"; hold: CoolingOffHold; started: boolean; message: string };

export function coolingOffMessage(hold: CoolingOffHold, now: Date = new Date()): string {
  const remainingMs = Math.max(0, new Date(hold.releaseAt).getTime() - now.getTime());
  const hours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
  return `This apparel haul is over your ${hold.category} budget. Waiting ${hours}h cooling-off before checkout — or confirm to override.`;
}

/** Prefer APPAREL overage; fashion impulse gate is apparel-first. */
export function pickApparelBudgetOverage(
  nudges: BudgetNudgePayload[],
): BudgetNudgePayload | null {
  const apparel = nudges.find((n) => n.exceeded && n.category.toUpperCase() === "APPAREL");
  if (apparel) return apparel;
  return null;
}

export function cartFingerprint(
  items: Array<{ listingVariantId?: string; variantId?: string; quantity: number }>,
): string {
  return items
    .map((it) => `${it.listingVariantId ?? it.variantId ?? "?"}:${it.quantity}`)
    .sort()
    .join("|");
}

export function computeHoldWindow(
  now: Date,
  nudge: Pick<BudgetNudgePayload, "category" | "projectedMinor" | "limitMinor">,
  fingerprint: string,
  holdMs: number = COOLING_OFF_MS,
): CoolingOffHold {
  const heldAt = now.toISOString();
  return {
    heldAt,
    releaseAt: new Date(now.getTime() + holdMs).toISOString(),
    category: nudge.category,
    projectedMinor: nudge.projectedMinor,
    limitMinor: nudge.limitMinor,
    cartFingerprint: fingerprint,
  };
}

export function isHoldActive(hold: CoolingOffHold | null | undefined, now: Date = new Date()): boolean {
  if (!hold?.releaseAt) return false;
  return new Date(hold.releaseAt).getTime() > now.getTime();
}

export function remainingHoldMs(hold: CoolingOffHold, now: Date = new Date()): number {
  return Math.max(0, new Date(hold.releaseAt).getTime() - now.getTime());
}

export function parseCoolingOffHold(raw: unknown): CoolingOffHold | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.heldAt !== "string" ||
    typeof o.releaseAt !== "string" ||
    typeof o.category !== "string" ||
    typeof o.projectedMinor !== "number" ||
    typeof o.limitMinor !== "number" ||
    typeof o.cartFingerprint !== "string"
  ) {
    return null;
  }
  return {
    heldAt: o.heldAt,
    releaseAt: o.releaseAt,
    category: o.category,
    projectedMinor: o.projectedMinor,
    limitMinor: o.limitMinor,
    cartFingerprint: o.cartFingerprint,
  };
}

export function readCoolingOffFromFlags(
  consentFlags: Record<string, unknown> | null | undefined,
): CoolingOffHold | null {
  return parseCoolingOffHold(consentFlags?.[COOLING_OFF_FLAG_KEY]);
}

/**
 * Soft-lock checkout when apparel would exceed budget, unless override or hold expired.
 * Starts a new 24h window on first block; reuses an active hold.
 */
export function evaluateCoolingOffCheckout(input: {
  nudges: BudgetNudgePayload[];
  existingHold: CoolingOffHold | null;
  fingerprint: string;
  override?: boolean;
  now?: Date;
  holdMs?: number;
}): CoolingOffDecision {
  const now = input.now ?? new Date();
  const overage = pickApparelBudgetOverage(input.nudges);
  if (!overage) {
    return { action: "allow", reason: "no_apparel_overage" };
  }
  if (input.override) {
    return { action: "allow", reason: "override" };
  }

  if (input.existingHold && isHoldActive(input.existingHold, now)) {
    const hold = {
      ...input.existingHold,
      projectedMinor: overage.projectedMinor,
      limitMinor: overage.limitMinor,
      category: overage.category,
      cartFingerprint: input.fingerprint,
    };
    return {
      action: "soft_lock",
      hold,
      started: false,
      message: coolingOffMessage(hold, now),
    };
  }

  // Hold finished (release job notified) — allow checkout; cleared on success.
  if (input.existingHold && !isHoldActive(input.existingHold, now)) {
    return { action: "allow", reason: "hold_expired" };
  }

  // First overage → start a fresh 24h soft lock
  const hold = computeHoldWindow(now, overage, input.fingerprint, input.holdMs);
  return {
    action: "soft_lock",
    hold,
    started: true,
    message: coolingOffMessage(hold, now),
  };
}

export function withCoolingOffFlag(
  consentFlags: Record<string, unknown> | null | undefined,
  hold: CoolingOffHold | null,
): Record<string, unknown> {
  const next = { ...(consentFlags ?? {}) };
  if (hold) next[COOLING_OFF_FLAG_KEY] = hold;
  else delete next[COOLING_OFF_FLAG_KEY];
  return next;
}
