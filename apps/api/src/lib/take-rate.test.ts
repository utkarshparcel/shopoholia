import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./repositories/memory.js";
import { exportSettlementsCsv, listSettlements, settleCompletedOrder } from "./take-rate.js";

describe("marketplace take-rate settlements", () => {
  let repos: ReturnType<typeof createMemoryRepositories>;
  beforeEach(() => {
    repos = createMemoryRepositories();
    process.env.FEATURE_TAKE_RATE = "1";
  });

  afterEach(() => {
    delete process.env.FEATURE_TAKE_RATE;
  });

  it("settles completed resale with fee + GST + payout", async () => {
    const row = await settleCompletedOrder(repos, {
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

  it("is idempotent on (kind, orderRef), across callers sharing the store", async () => {
    const a = await settleCompletedOrder(repos, {
      kind: "tailoring",
      orderRef: "tailor:1",
      sellerId: "t1",
      orderAmountMinor: 50_000,
    });
    const b = await settleCompletedOrder(repos, {
      kind: "tailoring",
      orderRef: "tailor:1",
      sellerId: "t1",
      orderAmountMinor: 50_000,
    });
    expect(a!.id).toBe(b!.id);
    expect(await listSettlements(repos)).toHaveLength(1);
    // The same ref for the other kind is its own order.
    await settleCompletedOrder(repos, { kind: "resale", orderRef: "tailor:1", sellerId: "s", orderAmountMinor: 1_000 });
    expect(await listSettlements(repos)).toHaveLength(2);
  });

  it("exports CSV report", async () => {
    await settleCompletedOrder(repos, {
      kind: "resale",
      orderRef: "disp-2",
      sellerId: "seller-2",
      orderAmountMinor: 20_000,
    });
    const csv = await exportSettlementsCsv(repos);
    expect(csv).toContain("platform_fee_minor");
    expect(csv).toContain("seller-2");
  });
});
