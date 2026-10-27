import { describe, expect, it } from "vitest";
import {
  bpsOf,
  computeTakeRate,
  DEFAULT_TAKE_RATE_BPS,
  settlementsToCsv,
  type SettlementRow,
} from "./take-rate.js";

describe("take-rate fee math", () => {
  it("computes platform fee + GST + seller payout for resale", () => {
    // ₹1,000.00 → 10% fee = ₹100; GST 18% on fee = ₹18; seller ₹900
    const r = computeTakeRate({ orderAmountMinor: 100_000, kind: "resale" });
    expect(r.takeRateBps).toBe(DEFAULT_TAKE_RATE_BPS.resale);
    expect(r.platformFeeMinor).toBe(10_000);
    expect(r.gstOnFeeMinor).toBe(1_800);
    expect(r.platformTotalMinor).toBe(11_800);
    expect(r.sellerPayoutMinor).toBe(90_000);
  });

  it("uses higher default take for tailoring", () => {
    const r = computeTakeRate({ orderAmountMinor: 50_000, kind: "tailoring" });
    expect(r.takeRateBps).toBe(1_500);
    expect(r.platformFeeMinor).toBe(7_500);
    expect(r.sellerPayoutMinor).toBe(42_500);
  });

  it("skips GST when applyGst=false", () => {
    const r = computeTakeRate({
      orderAmountMinor: 100_000,
      kind: "resale",
      applyGst: false,
    });
    expect(r.gstOnFeeMinor).toBe(0);
    expect(r.platformTotalMinor).toBe(r.platformFeeMinor);
  });

  it("bpsOf rounds half-up", () => {
    expect(bpsOf(100, 1_500)).toBe(15);
    expect(bpsOf(33, 1_000)).toBe(3);
  });

  it("rejects invalid amounts", () => {
    expect(() => computeTakeRate({ orderAmountMinor: -1, kind: "resale" })).toThrow();
    expect(() =>
      computeTakeRate({ orderAmountMinor: 100, kind: "resale", takeRateBps: 10_001 }),
    ).toThrow();
  });

  it("exports settlement CSV", () => {
    const rows: SettlementRow[] = [
      {
        id: "s1",
        kind: "resale",
        orderRef: "disp-1",
        sellerId: "seller-1",
        orderAmountMinor: 100_000,
        platformFeeMinor: 10_000,
        gstOnFeeMinor: 1_800,
        sellerPayoutMinor: 90_000,
        currency: "INR",
        completedAt: "2026-08-26T00:00:00.000Z",
      },
    ];
    const csv = settlementsToCsv(rows);
    expect(csv.split("\n")[0]).toContain("platform_fee_minor");
    expect(csv).toContain("100000");
    expect(csv).toContain("seller-1");
  });
});
