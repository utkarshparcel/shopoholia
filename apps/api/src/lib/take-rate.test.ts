import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetSettlementsForTests,
  exportSettlementsCsv,
  listSettlements,
  settleCompletedOrder,
} from "./take-rate.js";

describe("marketplace take-rate settlements", () => {
  beforeEach(() => {
    __resetSettlementsForTests();
    process.env.FEATURE_TAKE_RATE = "1";
  });

  afterEach(() => {
    delete process.env.FEATURE_TAKE_RATE;
  });

  it("settles completed resale with fee + GST + payout", () => {
    const row = settleCompletedOrder({
      kind: "resale",
      orderRef: "disp-abc",
      sellerId: "seller-1",
      orderAmountMinor: 100_000,
    });
    expect(row).not.toBeNull();
    expect(row!.platformFeeMinor).toBe(10_000);
    expect(row!.gstOnFeeMinor).toBe(1_800);
    expect(row!.sellerPayoutMinor).toBe(90_000);
  });

  it("is idempotent on orderRef", () => {
    const a = settleCompletedOrder({
      kind: "tailoring",
      orderRef: "tailor:1",
      sellerId: "t1",
      orderAmountMinor: 50_000,
    });
    const b = settleCompletedOrder({
      kind: "tailoring",
      orderRef: "tailor:1",
      sellerId: "t1",
      orderAmountMinor: 50_000,
    });
    expect(a!.id).toBe(b!.id);
    expect(listSettlements()).toHaveLength(1);
  });

  it("exports CSV report", () => {
    settleCompletedOrder({
      kind: "resale",
      orderRef: "disp-2",
      sellerId: "seller-2",
      orderAmountMinor: 20_000,
    });
    const csv = exportSettlementsCsv();
    expect(csv).toContain("platform_fee_minor");
    expect(csv).toContain("seller-2");
  });
});
