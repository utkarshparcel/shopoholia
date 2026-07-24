import { describe, expect, it } from "vitest";
import { buildStateEta, isValidTransition, nextState } from "./state-machine.js";

describe("order state machine", () => {
  it("builds beta state eta arc", () => {
    const placedAt = new Date("2026-06-18T12:00:00.000Z");
    const eta = buildStateEta(placedAt, "EXPRESS");
    expect(eta.PROCESSING).toBe(placedAt.toISOString());
    expect(eta.DELIVERED).toBe("2026-06-18T12:05:00.000Z");
    expect(eta.REVEAL_READY).toBeUndefined();
  });

  it("validates transitions including render-driven reveal", () => {
    expect(nextState("PROCESSING")).toBe("PACKED");
    expect(isValidTransition("PACKED", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidTransition("PACKED", "DELIVERED")).toBe(false);
    expect(isValidTransition("DELIVERED", "REVEAL_READY")).toBe(true);
  });
});
