import { beforeEach, describe, expect, it } from "vitest";
import {
  buildUnknownMerchantQueue,
  clearMerchantAliases,
  isUnknownMerchant,
  merchantPickerOptions,
  reprocessWindowFields,
  resolveMerchantAlias,
  upsertMerchantAlias,
} from "./merchant-alias.js";

describe("U042 merchant-alias", () => {
  beforeEach(() => clearMerchantAliases());

  it("detects unknown merchants", () => {
    expect(isUnknownMerchant(null)).toBe(true);
    expect(isUnknownMerchant("Unknown Merchant")).toBe(true);
    expect(isUnknownMerchant("Myntra")).toBe(false);
  });

  it("stores alias map and resolves canonical", () => {
    upsertMerchantAlias("u1", "myntra india", "Myntra");
    expect(resolveMerchantAlias("u1", "MYNTRA INDIA")).toBe("Myntra");
    expect(resolveMerchantAlias("u1", "Ajio")).toBe("Ajio");
  });

  it("builds unknown queue and reprocesses windows", () => {
    const queue = buildUnknownMerchantQueue([
      {
        id: "d1",
        kind: "EMAIL",
        parsedJson: { merchant: "Unknown Merchant" },
        matchedPurchaseId: "p1",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: "d2",
        kind: "EMAIL",
        parsedJson: { merchant: "Flipkart" },
        matchedPurchaseId: null,
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.documentId).toBe("d1");

    const windows = reprocessWindowFields({
      purchasedAt: new Date("2026-08-01T00:00:00.000Z"),
      merchant: "Flipkart",
    });
    expect(windows.returnWindowDeadline.getTime()).toBeGreaterThan(
      new Date("2026-08-01T00:00:00.000Z").getTime(),
    );
    expect(merchantPickerOptions("u1")).toContain("Myntra");
  });
});
