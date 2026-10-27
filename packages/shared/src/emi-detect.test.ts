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

  it("covers ISO due, USD, reverse amount phrasing, and missing due", () => {
    const iso = detectEmiSignal(
      "HDFC EMI",
      "EMI amount due $12.50. Outstanding $37.50. Due on 2026-10-01. USD.",
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(iso).not.toBeNull();
    expect(iso!.currency).toBe("USD");
    expect(iso!.installmentMinor).toBe(1250);
    expect(iso!.remainingMinor).toBe(3750);
    expect(iso!.nextDueOn).toBe("2026-10-01");
    expect(iso!.provider.toLowerCase()).toContain("hdfc");

    const reverse = detectEmiSignal(
      "Axis",
      "₹750 EMI due today for Zara purchase. Remaining balance ₹2250.",
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(reverse!.installmentMinor).toBe(75_000);
    expect(reverse!.nextDueOn).toBe("2026-08-27");
    expect(reverse!.merchant?.toLowerCase()).toContain("zara");

    // Ambiguous DD/MM treated as India DD/MM
    const dmy = detectEmiSignal(
      "ICICI",
      "Installment of Rs.100 due on 05/11/26. Outstanding Rs.300.",
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(dmy!.nextDueOn).toBe("2026-11-05");

    expect(
      detectEmiSignal("EMI reminder", "EMI of ₹500 is pending. No date."),
    ).toBeNull();

    // EMI keyword but no usable amount
    expect(detectEmiSignal("EMI", "Your EMI schedule was updated.")).toBeNull();

    // Default provider when no bank keyword
    const generic = detectEmiSignal(
      "Reminder",
      "Your installment ₹200 is due tomorrow.",
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(generic!.provider).toBe("EMI");
    expect(generic!.nextDueOn).toBe("2026-08-28");
    // remaining defaults to installment × 3 when omitted
    expect(generic!.remainingMinor).toBe(60_000);
  });
});
