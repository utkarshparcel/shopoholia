import { describe, expect, it } from "vitest";
import {
  LOGISTICS_PARTNERS,
  bookDispositionPickup,
  findLogisticsPartner,
  partnersForMode,
  suggestDispositionPrice,
} from "./disposition-logistics.js";

describe("disposition-logistics (DISP-LOGISTICS)", () => {
  it("suggestDispositionPrice depreciates by age and wears", () => {
    const now = new Date("2026-08-26T00:00:00.000Z");
    const fresh = suggestDispositionPrice({
      costMinor: 1000000, // ₹10,000
      createdAt: new Date("2026-02-26T00:00:00.000Z"), // ~0.5y
      category: "blazer",
      brand: "Raymond",
      wearCount: 0,
      now,
    });
    expect(fresh.suggestedPriceMinor).toBeGreaterThan(0);
    expect(fresh.suggestedPriceMinor).toBeLessThanOrEqual(fresh.ceilingMinor);
    expect(fresh.suggestedPriceMinor).toBeGreaterThanOrEqual(fresh.floorMinor);

    const worn = suggestDispositionPrice({
      costMinor: 1000000,
      createdAt: new Date("2023-08-26T00:00:00.000Z"), // 3y
      category: "blazer",
      wearCount: 40,
      now,
    });
    expect(worn.suggestedPriceMinor).toBeLessThan(fresh.suggestedPriceMinor);
    expect(worn.depreciationPct).toBeGreaterThan(fresh.depreciationPct);
    expect(worn.rationale).toMatch(/Resale ask/);
  });

  it("uses category default when cost is zero", () => {
    const s = suggestDispositionPrice({
      costMinor: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      category: "blazer",
      now: new Date("2026-01-15T00:00:00.000Z"),
    });
    expect(s.suggestedPriceMinor).toBeGreaterThan(100);
    expect(s.floorMinor).toBeGreaterThan(0);
  });

  it("lists partners and filters by mode", () => {
    expect(LOGISTICS_PARTNERS.length).toBeGreaterThanOrEqual(3);
    expect(partnersForMode("DONATE").every((p) => p.modes.includes("DONATE"))).toBe(true);
    expect(partnersForMode("SELL").every((p) => p.modes.includes("SELL"))).toBe(true);
    expect(findLogisticsPartner("stub-delhivery-resale")?.stub).toBe(true);
    expect(findLogisticsPartner("nope")).toBeNull();
  });

  it("bookDispositionPickup validates partner mode and future slot", () => {
    const future = new Date(Date.now() + 86_400_000);
    const ok = bookDispositionPickup({
      partnerId: "stub-delhivery-resale",
      pickupSlotAt: future,
      mode: "SELL",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.booking.stub).toBe(true);
      expect(ok.booking.partnerName).toMatch(/Delhivery/);
    }

    const wrongMode = bookDispositionPickup({
      partnerId: "stub-goonj-donate",
      pickupSlotAt: future,
      mode: "SELL",
    });
    expect(wrongMode.ok).toBe(false);

    const past = bookDispositionPickup({
      partnerId: "stub-goonj-donate",
      pickupSlotAt: new Date(Date.now() - 3_600_000),
      mode: "DONATE",
    });
    expect(past.ok).toBe(false);
  });
});
