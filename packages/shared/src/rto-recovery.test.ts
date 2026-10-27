import { describe, expect, it } from "vitest";
import {
  buildRtoChecklist,
  buildRtoRecoveryBoard,
  buildRtoRecoveryRow,
  isOnRtoRecoveryBoard,
  isOpenRtoRecovery,
} from "./rto-recovery.js";

describe("rto-recovery (N15)", () => {
  it("flags open FAILED / early return states", () => {
    expect(isOpenRtoRecovery("FAILED")).toBe(true);
    expect(isOpenRtoRecovery("SHIPPED", "INITIATED")).toBe(true);
    expect(isOpenRtoRecovery("DELIVERED", "REFUNDED")).toBe(false);
  });

  it("board include respects all=true closed rows", () => {
    expect(isOnRtoRecoveryBoard("FAILED")).toBe(true);
    expect(isOnRtoRecoveryBoard("DELIVERED", { returnState: "REFUNDED", all: true })).toBe(true);
    expect(isOnRtoRecoveryBoard("SHIPPED", { hasReturn: true, all: true })).toBe(true);
    expect(isOnRtoRecoveryBoard("DELIVERED")).toBe(false);
  });

  it("checklist advances CONTACT → OPEN → TRACK on FAILED", () => {
    const fresh = buildRtoChecklist({ deliveryStatus: "FAILED", hasReturn: false });
    expect(fresh.find((s) => s.id === "CONTACT_MERCHANT")?.state).toBe("current");
    expect(fresh.find((s) => s.id === "OPEN_REFUND")?.state).toBe("todo");

    const opened = buildRtoChecklist({
      deliveryStatus: "FAILED",
      hasReturn: true,
      returnState: "INITIATED",
    });
    expect(opened.find((s) => s.id === "CONTACT_MERCHANT")?.state).toBe("done");
    expect(opened.find((s) => s.id === "TRACK_REFUND")?.state).toBe("current");

    const done = buildRtoChecklist({
      deliveryStatus: "FAILED",
      hasReturn: true,
      returnState: "REFUNDED",
      ledgerCredited: true,
    });
    expect(done.every((s) => s.state === "done" || s.id === "CANCEL_OR_RESHIP")).toBe(true);
    expect(done.find((s) => s.id === "TRACK_REFUND")?.state).toBe("done");
  });

  it("builds board rows sorted with FAILED first", () => {
    const rows = buildRtoRecoveryBoard(
      [
        {
          purchaseId: "p-shipped",
          merchant: "Amazon",
          orderRef: "A1",
          totalMinor: 1000,
          currency: "INR",
          deliveryStatus: "SHIPPED",
          trackingCode: null,
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
        {
          purchaseId: "p-failed",
          merchant: "Myntra",
          orderRef: "M1",
          totalMinor: 2000,
          currency: "INR",
          deliveryStatus: "FAILED",
          trackingCode: "AWB1",
          updatedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      {
        "p-shipped": {
          id: "r1",
          state: "INITIATED",
          refundMinor: 1000,
          updatedAt: "2026-08-20T00:00:00.000Z",
        },
      },
    );
    expect(rows[0]?.purchaseId).toBe("p-failed");
    expect(rows[0]?.checklist.length).toBe(4);
    expect(rows.some((r) => r.purchaseId === "p-shipped")).toBe(true);
  });

  it("attaches refund track when return is on ETA board", () => {
    const row = buildRtoRecoveryRow(
      {
        purchaseId: "p1",
        merchant: "Amazon",
        orderRef: null,
        totalMinor: 500,
        currency: "INR",
        deliveryStatus: "FAILED",
        trackingCode: null,
        updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      },
      {
        id: "ret1",
        state: "CONFIRMED",
        refundMinor: 500,
        updatedAt: "2026-08-26T00:00:00.000Z",
      },
    );
    expect(row.returnId).toBe("ret1");
    expect(row.refundTrack).not.toBeNull();
    expect(row.failedAt).toContain("2026-08-26");
  });

  it("accepts Map inputs and all=true including closed rows", () => {
    const purchases = [
      {
        purchaseId: "p-closed",
        merchant: "Amazon",
        orderRef: "A2",
        totalMinor: 900,
        currency: "INR",
        deliveryStatus: "DELIVERED" as const,
        trackingCode: null,
        updatedAt: "2026-08-22T00:00:00.000Z",
      },
      {
        purchaseId: "p-failed-a",
        merchant: "Myntra",
        orderRef: "M2",
        totalMinor: 700,
        currency: "INR",
        deliveryStatus: "FAILED" as const,
        trackingCode: null,
        failedAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
      },
      {
        purchaseId: "p-failed-b",
        merchant: "Ajio",
        orderRef: "J1",
        totalMinor: 800,
        currency: "INR",
        deliveryStatus: "FAILED" as const,
        trackingCode: null,
        updatedAt: "2026-08-24T00:00:00.000Z",
      },
    ];
    const returns = new Map([
      [
        "p-closed",
        {
          id: "r-closed",
          state: "REFUNDED" as const,
          refundMinor: 900,
          updatedAt: "2026-08-22T00:00:00.000Z",
        },
      ],
    ]);
    const ledger = new Map([
      ["r-closed", { amountMinor: 900, creditedAt: "2026-08-23T00:00:00.000Z" }],
    ]);
    const rows = buildRtoRecoveryBoard(purchases, returns, ledger, { all: true });
    expect(rows.some((r) => r.purchaseId === "p-closed")).toBe(true);
    // FAILED rows sort first, then by purchaseId
    expect(rows[0]?.purchaseId).toBe("p-failed-a");
    expect(rows[1]?.purchaseId).toBe("p-failed-b");
    expect(rows[0]?.failedAt).toContain("2026-08-25");
  });
});
