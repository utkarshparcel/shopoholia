import { describe, expect, it } from "vitest";
import {
  barcodeSuccessFeedback,
  celebrationHapticEvent,
  hapticStyleForMoment,
  isDelightHapticEvent,
  shouldFireDelightHaptic,
} from "./delight-haptics.js";

describe("delight-haptics stubs (W027 / UX-HAPTICS)", () => {
  it("maps core + barcode styles", () => {
    expect(hapticStyleForMoment("found_money")).toBe("medium");
    expect(hapticStyleForMoment("wore_it")).toBe("light");
    expect(hapticStyleForMoment("refund_landed")).toBe("medium");
    expect(hapticStyleForMoment("barcode_success")).toBe("success");
    expect(isDelightHapticEvent("barcode_success")).toBe(true);
    expect(isDelightHapticEvent("nope")).toBe(false);
  });

  it("barcode success: full vs haptic-only under Reduce Motion", () => {
    expect(barcodeSuccessFeedback(false)).toEqual({
      mode: "full",
      haptic: true,
      confetti: true,
      event: "barcode_success",
      style: "success",
    });
    expect(barcodeSuccessFeedback(true)).toEqual({
      mode: "haptic_only",
      haptic: true,
      confetti: false,
      event: "barcode_success",
      style: "success",
    });
  });

  it("maps celebration sources (W007)", () => {
    expect(celebrationHapticEvent("manual")).toBe("celebration_manual");
    expect(celebrationHapticEvent("oauth")).toBe("celebration_oauth");
    expect(celebrationHapticEvent("demo")).toBe("celebration_demo");
    expect(hapticStyleForMoment("celebration_demo")).toBe("light");
  });

  it("gates fire policy for web / reduce motion", () => {
    expect(
      shouldFireDelightHaptic({ reduceMotion: false, platformOS: "web" }),
    ).toBe(false);
    expect(
      shouldFireDelightHaptic({ reduceMotion: true, platformOS: "ios" }),
    ).toBe(false);
    expect(
      shouldFireDelightHaptic({
        reduceMotion: true,
        platformOS: "ios",
        suppressHapticsWithReduceMotion: false,
      }),
    ).toBe(true);
    expect(
      shouldFireDelightHaptic({ reduceMotion: false, platformOS: "android" }),
    ).toBe(true);
  });
});
