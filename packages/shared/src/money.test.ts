import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRENCY,
  addMinor,
  formatMinor,
  fromMinor,
  fractionDigits,
  isNonNegativeMinor,
  spendMinor,
  subtractMinor,
  toMinor,
} from "./money.js";

describe("fractionDigits", () => {
  it("returns 2 for common currencies", () => {
    expect(fractionDigits("INR")).toBe(2);
    expect(fractionDigits("USD")).toBe(2);
    expect(fractionDigits("EUR")).toBe(2);
    expect(fractionDigits("GBP")).toBe(2);
  });

  it("returns 0 for JPY", () => {
    expect(fractionDigits("JPY")).toBe(0);
  });

  it("is case-insensitive and falls back to 2", () => {
    expect(fractionDigits("inr")).toBe(2);
    expect(fractionDigits("XYZ")).toBe(2);
  });
});

describe("toMinor", () => {
  it("converts major units to minor with 2 digits", () => {
    expect(toMinor(12.34)).toBe(1234);
    expect(toMinor(0)).toBe(0);
    expect(toMinor(100)).toBe(10000);
  });

  it("rounds to the nearest minor unit", () => {
    expect(toMinor(12.345)).toBe(1235);
    expect(toMinor(12.344)).toBe(1234);
  });

  it("honors the currency's fraction digits", () => {
    expect(toMinor(100, "JPY")).toBe(100);
    expect(toMinor(100, "USD")).toBe(10000);
  });
});

describe("fromMinor", () => {
  it("converts minor units back to major", () => {
    expect(fromMinor(1234)).toBe(12.34);
    expect(fromMinor(0)).toBe(0);
  });

  it("round-trips with toMinor", () => {
    expect(fromMinor(toMinor(57.89))).toBeCloseTo(57.89, 5);
  });
});

describe("addMinor / subtractMinor", () => {
  it("adds", () => expect(addMinor(100, 50)).toBe(150));
  it("subtracts", () => expect(subtractMinor(100, 50)).toBe(50));
});

describe("spendMinor", () => {
  it("returns the remainder on a valid spend", () => {
    expect(spendMinor(500, 200)).toBe(300);
    expect(spendMinor(200, 200)).toBe(0);
  });

  it("throws instead of returning a negative balance", () => {
    expect(() => spendMinor(100, 150)).toThrow(/Insufficient balance/);
  });
});

describe("formatMinor", () => {
  it("formats INR with the rupee symbol", () => {
    expect(formatMinor(1234, "INR", "en-IN")).toBe("₹12.34");
  });

  it("uses Indian (en-IN) grouping for lakhs", () => {
    // 12_34_56_789 paise → ₹12,34,567.89
    const label = formatMinor(123_456_789, "INR", "en-IN");
    expect(label).toMatch(/^₹/);
    expect(label).toContain("12,34,567.89");
  });

  it("formats USD and GBP for W003 picker locales", () => {
    expect(formatMinor(1234, "USD", "en-US")).toBe("$12.34");
    expect(formatMinor(1234, "GBP", "en-GB")).toBe("£12.34");
  });

  it("falls back to a plain string when Intl throws", () => {
    const bad = formatMinor(1234, "INVALID-CURRENCY", "en-IN");
    expect(bad).toContain("12.34");
  });
});

describe("isNonNegativeMinor", () => {
  it("accepts non-negative integers", () => {
    expect(isNonNegativeMinor(0)).toBe(true);
    expect(isNonNegativeMinor(100)).toBe(true);
  });

  it("rejects negatives and non-integers", () => {
    expect(isNonNegativeMinor(-1)).toBe(false);
    expect(isNonNegativeMinor(1.5)).toBe(false);
    expect(isNonNegativeMinor(Number.NaN)).toBe(false);
  });
});

describe("DEFAULT_CURRENCY", () => {
  it("is INR", () => expect(DEFAULT_CURRENCY).toBe("INR"));
});
