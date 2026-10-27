import { describe, expect, it } from "vitest";
import {
  buildRegionalOfferings,
  isUpiPathActive,
  priceForProduct,
  pricesForRegion,
  selectPaymentMethod,
} from "./regional-pricing.js";

describe("regional pricing + UPI path", () => {
  it("exposes India price points for Closet premium", () => {
    const inPrices = pricesForRegion("IN");
    expect(inPrices.every((p) => p.currency === "INR")).toBe(true);
    expect(priceForProduct("closet_premium_monthly", "IN")?.priceLabel).toBe("₹199");
  });

  it("builds offerings with trial + price labels", () => {
    const offerings = buildRegionalOfferings("IN");
    expect(offerings.length).toBeGreaterThanOrEqual(3);
    expect(offerings[0]!.trialDays).toBe(7);
    expect(offerings.find((o) => o.productId === "closet_premium_monthly")?.priceLabel).toBe(
      "₹199",
    );
  });

  it("activates UPI path only for IN + experiment flag", () => {
    expect(isUpiPathActive({ region: "IN", upiExperimentEnabled: true })).toBe(true);
    expect(isUpiPathActive({ region: "IN", upiExperimentEnabled: false })).toBe(false);
    expect(isUpiPathActive({ region: "US", upiExperimentEnabled: true })).toBe(false);
  });

  it("selects payment method by region + flags", () => {
    expect(
      selectPaymentMethod({
        region: "IN",
        upiExperimentEnabled: true,
        revenueCatEnabled: true,
      }),
    ).toBe("upi");
    expect(
      selectPaymentMethod({
        region: "US",
        upiExperimentEnabled: false,
        revenueCatEnabled: true,
      }),
    ).toBe("iap");
    expect(
      selectPaymentMethod({
        region: "IN",
        upiExperimentEnabled: false,
        revenueCatEnabled: false,
      }),
    ).toBe("upi");
    expect(
      selectPaymentMethod({
        region: "GLOBAL",
        upiExperimentEnabled: false,
        revenueCatEnabled: false,
      }),
    ).toBe("iap");
  });

  it("maps GLOBAL to US prices with GLOBAL region tag", () => {
    const globalPrices = pricesForRegion("GLOBAL");
    expect(globalPrices.every((p) => p.region === "GLOBAL")).toBe(true);
    expect(globalPrices.every((p) => p.currency === "USD")).toBe(true);
    expect(priceForProduct("closet_premium_monthly", "US")?.priceLabel).toBe("$4.99");
  });
});
