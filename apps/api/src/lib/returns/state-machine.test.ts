import { describe, expect, it } from "vitest";
import { isValidReturnTransition, nextReturnStates } from "./state-machine.js";

describe("return state machine", () => {
  it("allows the happy path REQUESTED → … → REFUNDED", () => {
    expect(isValidReturnTransition("REQUESTED", "INITIATED")).toBe(true);
    expect(isValidReturnTransition("INITIATED", "CONFIRMED")).toBe(true);
    expect(isValidReturnTransition("CONFIRMED", "REFUNDED")).toBe(true);
  });

  it("allows INITIATED → PICKUP_SCHEDULED → CONFIRMED (WV01-PICKUP-BOOK)", () => {
    expect(isValidReturnTransition("INITIATED", "PICKUP_SCHEDULED")).toBe(true);
    expect(isValidReturnTransition("PICKUP_SCHEDULED", "CONFIRMED")).toBe(true);
    expect(isValidReturnTransition("REQUESTED", "PICKUP_SCHEDULED")).toBe(false);
    // U019 — cancel pickup returns to INITIATED
    expect(isValidReturnTransition("PICKUP_SCHEDULED", "INITIATED")).toBe(true);
  });

  it("rejects illegal and terminal transitions", () => {
    expect(isValidReturnTransition("REQUESTED", "REFUNDED")).toBe(false);
    expect(isValidReturnTransition("REFUNDED", "INITIATED")).toBe(false);
    expect(isValidReturnTransition("EXPIRED", "REQUESTED")).toBe(false);
    expect(isValidReturnTransition("CANCELLED", "INITIATED")).toBe(false);
  });

  it("lists next states including pickup + cancel/expire exits", () => {
    expect(nextReturnStates("REQUESTED")).toEqual(["INITIATED", "CANCELLED", "EXPIRED"]);
    expect(nextReturnStates("INITIATED")).toEqual([
      "PICKUP_SCHEDULED",
      "CONFIRMED",
      "CANCELLED",
      "EXPIRED",
    ]);
    expect(nextReturnStates("PICKUP_SCHEDULED")).toEqual([
      "INITIATED",
      "CONFIRMED",
      "CANCELLED",
      "EXPIRED",
    ]);
    expect(nextReturnStates("CONFIRMED")).toEqual(["REFUNDED", "EXPIRED"]);
    expect(nextReturnStates("REFUNDED")).toEqual([]);
    expect(nextReturnStates("EXPIRED")).toEqual([]);
    expect(nextReturnStates("CANCELLED")).toEqual([]);
  });
});
