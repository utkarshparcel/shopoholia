import { describe, expect, it } from "vitest";
import {
  carrierTrackingUrl,
  defaultEtaForStatus,
  detectCarrierFromTracking,
  detectDeliveryFromText,
  extractEta,
  packageDeliveryTimeline,
} from "./package-delivery.js";

describe("detectDeliveryFromText", () => {
  it("defaults to ORDERED without shipping signal", () => {
    expect(detectDeliveryFromText("Thanks for your order", "We'll pack soon").deliveryStatus).toBe(
      "ORDERED",
    );
  });

  it("maps cancelled / failed / delivered / transit statuses", () => {
    expect(detectDeliveryFromText("Update", "Order cancelled").deliveryStatus).toBe("CANCELLED");
    expect(detectDeliveryFromText("RTO", "Return to origin").deliveryStatus).toBe("FAILED");
    expect(detectDeliveryFromText("Done", "Successfully delivered").deliveryStatus).toBe(
      "DELIVERED",
    );
    expect(detectDeliveryFromText("OFD", "Out for delivery today").deliveryStatus).toBe(
      "OUT_FOR_DELIVERY",
    );
    expect(detectDeliveryFromText("Ship", "Package in transit").deliveryStatus).toBe("IN_TRANSIT");
    expect(detectDeliveryFromText("Ship", "Your order has shipped").deliveryStatus).toBe("SHIPPED");
  });

  it("extracts tracking codes", () => {
    const ups = detectDeliveryFromText("Shipped", "Tracking number: 1Z999AA10123456784");
    expect(ups.trackingCode).toMatch(/^1Z/);
    const awb = detectDeliveryFromText("AWB", "AWB: ABCD12345678");
    expect(awb.trackingCode).toBe("ABCD12345678");
  });
});

describe("extractEta", () => {
  const now = new Date("2026-08-26T10:00:00.000Z");

  it("parses dated ETA phrases", () => {
    const iso = extractEta("Estimated delivery: 1 Sep 2026", now);
    expect(iso).toBe("2026-09-01T12:00:00.000Z");
  });

  it("handles today / tomorrow relative ETAs", () => {
    expect(extractEta("Arriving today", now)).toBe("2026-08-26T18:00:00.000Z");
    expect(extractEta("Delivery tomorrow", now)).toBe("2026-08-27T18:00:00.000Z");
  });

  it("returns null when no ETA signal", () => {
    expect(extractEta("Thanks for shopping", now)).toBeNull();
  });
});

describe("defaultEtaForStatus", () => {
  const purchasedAt = new Date("2026-08-20T00:00:00.000Z");
  const now = new Date("2026-08-26T00:00:00.000Z");

  it("adds day offsets for open statuses", () => {
    expect(defaultEtaForStatus("ORDERED", purchasedAt, now)?.toISOString()).toBe(
      new Date(purchasedAt.getTime() + 5 * 86_400_000).toISOString(),
    );
    expect(defaultEtaForStatus("OUT_FOR_DELIVERY", purchasedAt, now)?.toISOString()).toBe(
      purchasedAt.toISOString(),
    );
  });

  it("returns null for terminal statuses", () => {
    expect(defaultEtaForStatus("DELIVERED", purchasedAt, now)).toBeNull();
    expect(defaultEtaForStatus("FAILED", purchasedAt, now)).toBeNull();
    expect(defaultEtaForStatus("CANCELLED", purchasedAt, now)).toBeNull();
  });
});

describe("packageDeliveryTimeline (W039)", () => {
  it("marks current step and prior done", () => {
    const steps = packageDeliveryTimeline("IN_TRANSIT");
    expect(steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "todo",
      "todo",
    ]);
  });

  it("ends on delivered", () => {
    const steps = packageDeliveryTimeline("DELIVERED");
    expect(steps.at(-1)).toMatchObject({ id: "DELIVERED", state: "current" });
    expect(steps.every((s, i) => (i < steps.length - 1 ? s.state === "done" : true))).toBe(true);
  });

  it("appends failed / cancelled terminal", () => {
    expect(packageDeliveryTimeline("FAILED").at(-1)).toMatchObject({
      id: "FAILED",
      state: "failed",
    });
    expect(packageDeliveryTimeline("CANCELLED").at(-1)).toMatchObject({
      id: "CANCELLED",
      state: "failed",
    });
  });
});

describe("U018 carrier detect from tracking paste", () => {
  it("detects UPS 1Z codes and builds deep link", () => {
    const detected = detectCarrierFromTracking("1Z999AA10123456784");
    expect(detected?.carrier).toBe("UPS");
    expect(carrierTrackingUrl(detected!.carrier, detected!.trackingCode)).toContain("ups.com");
  });

  it("returns null for short junk", () => {
    expect(detectCarrierFromTracking("abc")).toBeNull();
  });
});
