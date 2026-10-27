import { describe, expect, it } from "vitest";
import { detectEmiSignal } from "./emi-detect.js";

describe("detectEmiSignal (U007)", () => {
  it("parses Simpl EMI due SMS fixture", () => {
    const signal = detectEmiSignal(
      "SMS from SIMPL",
      "Simpl: EMI of Rs.999 due on 15/09/2026 for Myntra purchase. Outstanding Rs.2997. Avoid late fees.",
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(signal).not.toBeNull();
    expect(signal!.provider.toLowerCase()).toContain("simpl");
    expect(signal!.installmentMinor).toBe(99_900);
    expect(signal!.remainingMinor).toBe(299_700);
    expect(signal!.nextDueOn).toBe("2026-09-15");
    expect(signal!.currency).toBe("INR");
    expect(signal!.merchant?.toLowerCase()).toContain("myntra");
  });

  it("parses LazyPay due tomorrow fixture", () => {
    const signal = detectEmiSignal(
      "SMS from LAZYPAY",
      "LazyPay: Your installment ₹500 is due tomorrow. Remaining balance ₹1500.",
      new Date("2026-08-27T12:00:00.000Z"),
    );
    expect(signal).not.toBeNull();
    expect(signal!.provider.toLowerCase()).toContain("lazypay");
    expect(signal!.installmentMinor).toBe(50_000);
    expect(signal!.remainingMinor).toBe(150_000);
    expect(signal!.nextDueOn).toBe("2026-08-28");
  });

  it("returns null for non-EMI purchase SMS", () => {
    expect(
      detectEmiSignal(
        "SMS from MYNTRA",
        "Your Myntra order ORD123 of ₹1999 is confirmed.",
      ),
    ).toBeNull();
  });
});
