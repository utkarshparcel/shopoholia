import { describe, expect, it } from "vitest";
import {
  isTerminalTailorState,
  isValidTailorTransition,
  nextTailorStates,
} from "./tailor-state-machine.js";

describe("tailor-state-machine", () => {
  it("allows the production ladder", () => {
    expect(isValidTailorTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(isValidTailorTransition("CONFIRMED", "IN_STITCHING")).toBe(true);
    expect(isValidTailorTransition("IN_STITCHING", "SHIPPED")).toBe(true);
    expect(isValidTailorTransition("SHIPPED", "DELIVERED")).toBe(true);
  });

  it("rejects skips and reverse transitions", () => {
    expect(isValidTailorTransition("PENDING", "SHIPPED")).toBe(false);
    expect(isValidTailorTransition("DELIVERED", "PENDING")).toBe(false);
    expect(isValidTailorTransition("CANCELLED", "CONFIRMED")).toBe(false);
  });

  it("exposes next states and terminals", () => {
    expect(nextTailorStates("PENDING")).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(isTerminalTailorState("DELIVERED")).toBe(true);
    expect(isTerminalTailorState("IN_STITCHING")).toBe(false);
  });
});
