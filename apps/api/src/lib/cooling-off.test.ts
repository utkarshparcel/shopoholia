import { describe, expect, it } from "vitest";
import {
  COOLING_OFF_MS,
  cartFingerprint,
  computeHoldWindow,
  evaluateCoolingOffCheckout,
  isHoldActive,
  pickApparelBudgetOverage,
  remainingHoldMs,
  withCoolingOffFlag,
} from "./cooling-off.js";
import type { BudgetNudgePayload } from "./budget.js";

function nudge(partial: Partial<BudgetNudgePayload> & Pick<BudgetNudgePayload, "category" | "exceeded">): BudgetNudgePayload {
  return {
    limitMinor: 10_000,
    actualMinor: 8_000,
    proposedMinor: 5_000,
    projectedMinor: 13_000,
    message: "over",
    ...partial,
  };
}

describe("cooling-off hold window (N34)", () => {
  it("COOLING_OFF_MS is 24h", () => {
    expect(COOLING_OFF_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("picks APPAREL overage only", () => {
    expect(
      pickApparelBudgetOverage([
        nudge({ category: "GENERAL", exceeded: true }),
        nudge({ category: "FOOTWEAR", exceeded: true }),
      ]),
    ).toBeNull();
    expect(
      pickApparelBudgetOverage([
        nudge({ category: "GENERAL", exceeded: true }),
        nudge({ category: "APPAREL", exceeded: true, projectedMinor: 99 }),
      ])?.projectedMinor,
    ).toBe(99);
  });

  it("computes 24h releaseAt from heldAt", () => {
    const now = new Date("2026-08-26T10:00:00.000Z");
    const hold = computeHoldWindow(
      now,
      { category: "APPAREL", projectedMinor: 12_000, limitMinor: 10_000 },
      "v1:1",
    );
    expect(hold.heldAt).toBe(now.toISOString());
    expect(hold.releaseAt).toBe(new Date(now.getTime() + COOLING_OFF_MS).toISOString());
    expect(isHoldActive(hold, now)).toBe(true);
    expect(remainingHoldMs(hold, now)).toBe(COOLING_OFF_MS);
    expect(isHoldActive(hold, new Date(now.getTime() + COOLING_OFF_MS + 1))).toBe(false);
  });

  it("soft-locks and starts a hold on first apparel overage", () => {
    const now = new Date("2026-08-26T10:00:00.000Z");
    const decision = evaluateCoolingOffCheckout({
      nudges: [nudge({ category: "APPAREL", exceeded: true })],
      existingHold: null,
      fingerprint: cartFingerprint([{ listingVariantId: "a", quantity: 1 }]),
      now,
    });
    expect(decision.action).toBe("soft_lock");
    if (decision.action !== "soft_lock") return;
    expect(decision.started).toBe(true);
    expect(decision.hold.releaseAt).toBe(
      new Date(now.getTime() + COOLING_OFF_MS).toISOString(),
    );
    expect(decision.message).toMatch(/cooling-off|override/i);
  });

  it("reuses active hold without restarting the clock", () => {
    const heldAt = new Date("2026-08-26T10:00:00.000Z");
    const existing = computeHoldWindow(
      heldAt,
      { category: "APPAREL", projectedMinor: 12_000, limitMinor: 10_000 },
      "v1:1",
    );
    const later = new Date(heldAt.getTime() + 60 * 60 * 1000);
    const decision = evaluateCoolingOffCheckout({
      nudges: [nudge({ category: "APPAREL", exceeded: true, projectedMinor: 15_000 })],
      existingHold: existing,
      fingerprint: "v1:2",
      now: later,
    });
    expect(decision.action).toBe("soft_lock");
    if (decision.action !== "soft_lock") return;
    expect(decision.started).toBe(false);
    expect(decision.hold.releaseAt).toBe(existing.releaseAt);
  });

  it("allows override, under-budget, and expired holds", () => {
    const now = new Date("2026-08-26T10:00:00.000Z");
    expect(
      evaluateCoolingOffCheckout({
        nudges: [nudge({ category: "APPAREL", exceeded: true })],
        existingHold: null,
        fingerprint: "x",
        override: true,
        now,
      }).action,
    ).toBe("allow");

    expect(
      evaluateCoolingOffCheckout({
        nudges: [nudge({ category: "GENERAL", exceeded: true })],
        existingHold: null,
        fingerprint: "x",
        now,
      }),
    ).toEqual({ action: "allow", reason: "no_apparel_overage" });

    const expired = computeHoldWindow(
      new Date(now.getTime() - COOLING_OFF_MS - 1000),
      { category: "APPAREL", projectedMinor: 12_000, limitMinor: 10_000 },
      "x",
    );
    expect(
      evaluateCoolingOffCheckout({
        nudges: [nudge({ category: "APPAREL", exceeded: true })],
        existingHold: expired,
        fingerprint: "x",
        now,
      }),
    ).toEqual({ action: "allow", reason: "hold_expired" });
  });

  it("withCoolingOffFlag sets and clears the consent flag", () => {
    const hold = computeHoldWindow(
      new Date("2026-08-26T10:00:00.000Z"),
      { category: "APPAREL", projectedMinor: 1, limitMinor: 1 },
      "fp",
    );
    const withHold = withCoolingOffFlag({ notifications: {} }, hold);
    expect(withHold.coolingOff).toEqual(hold);
    expect(withCoolingOffFlag(withHold, null).coolingOff).toBeUndefined();
  });
});
