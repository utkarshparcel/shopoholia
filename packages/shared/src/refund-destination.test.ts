import { describe, expect, it } from "vitest";
import {
  matchesRefundDestinationFilter,
  parseRefundDestinationFromRefType,
  preferredRefundAccountKind,
  refundLedgerRefType,
} from "./refund-destination.js";

describe("refund-destination (U012)", () => {
  it("builds and parses ledger refType", () => {
    expect(refundLedgerRefType("UPI")).toBe("return.refund:UPI");
    expect(parseRefundDestinationFromRefType("return.refund:ORIGINAL_CARD")).toBe(
      "ORIGINAL_CARD",
    );
    expect(parseRefundDestinationFromRefType("return.refund")).toBeNull();
    expect(parseRefundDestinationFromRefType(null)).toBeNull();
  });

  it("filters accountant rows by destination", () => {
    expect(
      matchesRefundDestinationFilter("REFUND return.refund:UPI", "UPI"),
    ).toBe(true);
    expect(
      matchesRefundDestinationFilter("REFUND return.refund:UPI", "STORE_CREDIT"),
    ).toBe(false);
    expect(matchesRefundDestinationFilter("REFUND return.refund:UPI", "ALL")).toBe(
      true,
    );
  });

  it("maps destination to account kind", () => {
    expect(preferredRefundAccountKind("STORE_CREDIT")).toBe("STORE_CREDIT");
    expect(preferredRefundAccountKind("UPI")).toBe("CASH");
    expect(preferredRefundAccountKind("ORIGINAL_CARD")).toBe("CASH");
  });
});
