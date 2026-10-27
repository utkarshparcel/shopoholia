import { describe, expect, it } from "vitest";
import {
  buildGstInvoiceRequestPacket,
  defaultInvoiceContactFromMerchant,
  gstInvoiceArrivedHref,
  gstInvoiceRequestBody,
} from "./gstInvoiceRequest.js";

describe("U026 gst invoice request", () => {
  it("prefills merchant request body with order refs", () => {
    const body = gstInvoiceRequestBody({
      merchant: "Myntra",
      orderRef: "MYN-99",
      purchasedAt: "2026-08-01T10:00:00.000Z",
      itemTitle: "Kurta",
      totalMinor: 199900,
      currency: "INR",
    });
    expect(body).toMatch(/GST \/ tax invoice/i);
    expect(body).toContain("Myntra");
    expect(body).toContain("MYN-99");
    expect(body).toContain("2026-08-01");
    expect(body).toContain("Kurta");
  });

  it("builds mailto packet and marks contact from merchant", () => {
    expect(defaultInvoiceContactFromMerchant("Ajio Fashion")).toBe("support@ajiofashion.com");
    const packet = buildGstInvoiceRequestPacket({
      merchant: "Ajio",
      orderRef: "A1",
    });
    expect(packet.requestUrl).toMatch(/^mailto:support@ajio\.com\?/);
    expect(packet.subject).toContain("Ajio");
    expect(packet.shareText).toContain("GST");
  });

  it("uses https portal contact as-is", () => {
    const packet = buildGstInvoiceRequestPacket({
      merchant: "Amazon",
      contactOverride: "https://www.amazon.in/gp/help/customer/contact-us",
    });
    expect(packet.requestUrl).toBe("https://www.amazon.in/gp/help/customer/contact-us");
  });

  it("builds vault link when invoice arrives", () => {
    expect(
      gstInvoiceArrivedHref({ receiptId: "r1", merchant: "Myntra" }),
    ).toBe("/(closet)/vault?focus=gst&receiptId=r1&merchant=Myntra");
  });
});
