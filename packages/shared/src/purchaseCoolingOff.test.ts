import { describe, expect, it } from "vitest";
import { merchantCancelUrl } from "./merchantCancelUrl.js";
import {
  buildPurchaseCoolingOff,
  cancelWindowHours,
  computeCancelDeadline,
} from "./purchaseCoolingOff.js";

describe("U027 purchase cooling-off", () => {
  it("maps merchant cancel URLs", () => {
    expect(merchantCancelUrl("Myntra")).toContain("myntra.com");
    expect(merchantCancelUrl("Unknown Boutique")).toBeNull();
  });

  it("computes timer + cancel CTA when URL known", () => {
    const purchasedAt = new Date("2026-08-27T00:00:00.000Z");
    const now = new Date("2026-08-27T06:00:00.000Z");
    expect(cancelWindowHours("Myntra")).toBe(24);
    const release = computeCancelDeadline(purchasedAt, "Myntra");
    expect(release.toISOString()).toBe("2026-08-28T00:00:00.000Z");

    const cooling = buildPurchaseCoolingOff({
      merchant: "Myntra",
      purchasedAt,
      deliveryStatus: "ORDERED",
      now,
    });
    expect(cooling?.active).toBe(true);
    expect(cooling?.cancelUrl).toContain("myntra.com");
    expect(cooling?.checklist.some((s) => s.id === "OPEN_ORDERS")).toBe(true);
    expect(cooling?.message).toMatch(/Cancel within/i);
  });

  it("falls back to checklist when cancel URL unknown", () => {
    const cooling = buildPurchaseCoolingOff({
      merchant: "Local Tailor Co",
      purchasedAt: new Date(),
      deliveryStatus: "ORDERED",
    });
    expect(cooling?.cancelUrl).toBeNull();
    expect(cooling?.checklist.map((s) => s.id)).toContain("CHAT_SUPPORT");
  });

  it("returns null when window expired or already shipped far", () => {
    const purchasedAt = new Date("2026-08-01T00:00:00.000Z");
    expect(
      buildPurchaseCoolingOff({
        merchant: "Amazon",
        purchasedAt,
        deliveryStatus: "ORDERED",
        now: new Date("2026-08-10T00:00:00.000Z"),
      }),
    ).toBeNull();
    expect(
      buildPurchaseCoolingOff({
        merchant: "Amazon",
        purchasedAt: new Date(),
        deliveryStatus: "IN_TRANSIT",
      }),
    ).toBeNull();
    expect(
      buildPurchaseCoolingOff({
        merchant: "Amazon",
        purchasedAt: new Date(),
        deliveryStatus: "CANCELLED",
      }),
    ).toBeNull();
  });
});
