import { describe, expect, it } from "vitest";
import {
  buildPortalFieldChecklist,
  formatReturnReasonLabel,
  portalChecklistReady,
} from "./portal-checklist.js";

describe("U017 portal field checklist", () => {
  it("builds copyable order / sku / reason fields from purchase graph", () => {
    const fields = buildPortalFieldChecklist({
      orderRef: "ORD-99",
      skuOrTitle: "Blue Kurta M",
      reason: "TOO_SMALL",
      merchant: "Myntra",
    });
    expect(fields.map((f) => f.id)).toEqual(["order_id", "sku", "reason", "merchant"]);
    expect(fields.find((f) => f.id === "reason")?.value).toBe("Too small");
    expect(portalChecklistReady(fields)).toBe(true);
  });

  it("omits empty fields and formats unknown reasons", () => {
    expect(buildPortalFieldChecklist({}).length).toBe(0);
    expect(formatReturnReasonLabel("CUSTOM")).toBe("CUSTOM");
    expect(portalChecklistReady([])).toBe(false);
  });
});
