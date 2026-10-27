import { describe, expect, it } from "vitest";
import * as shared from "./index.js";

describe("package exports", () => {
  it("re-exports core modules", () => {
    expect(shared.ONBOARDING_COIN_GRANT).toBe(500);
    expect(shared.OtpRequestSchema).toBeDefined();
    expect(shared.AvatarStatusSchema).toBeDefined();
    expect(shared.OrderState).toBeDefined();
  });

  it("re-exports Wave A money / delight foundations", () => {
    expect(shared.formatMinor).toBeTypeOf("function");
    expect(shared.formatMinorWithPrefs).toBeTypeOf("function");
    expect(shared.defaultCurrencyFromLocale).toBeTypeOf("function");
    expect(shared.foundMoneyCountUpPlan).toBeTypeOf("function");
    expect(shared.barcodeSuccessFeedback).toBeTypeOf("function");
    expect(shared.hapticStyleForMoment).toBeTypeOf("function");
  });
});
