import { describe, expect, it } from "vitest";
import {
  buildWarrantyClaimPacket,
  buildWarrantyClaimUrl,
  canUnclaimWarranty,
  defaultClaimContactFromMerchant,
  WARRANTY_UNCLAIM_WINDOW_MS,
} from "./warrantyClaim.js";

describe("buildWarrantyClaimUrl", () => {
  const base = {
    itemTitle: "Wireless Headphones",
    provider: "Croma",
    orderRef: "ORD-9988",
    coverageUntil: "2027-06-01T00:00:00.000Z",
  };

  it("builds a prefilled mailto with merchant + order refs", () => {
    const url = buildWarrantyClaimUrl({
      ...base,
      claimContact: "support@croma.com",
    });
    expect(url).toMatch(/^mailto:support@croma\.com\?/);
    expect(url).toContain("subject=");
    expect(url).toContain("body=");
    const decoded = decodeURIComponent(url!);
    expect(decoded).toContain("Wireless Headphones");
    expect(decoded).toContain("Croma");
    expect(decoded).toContain("ORD-9988");
    expect(decoded).toContain("2027-06-01");
  });

  it("passes through https claim portals as deep-links", () => {
    expect(
      buildWarrantyClaimUrl({
        ...base,
        claimContact: "https://croma.com/warranty/claim",
      }),
    ).toBe("https://croma.com/warranty/claim");
  });

  it("builds tel: links from phone numbers", () => {
    expect(
      buildWarrantyClaimUrl({
        ...base,
        claimContact: "+91 1800 123 4567",
      }),
    ).toBe("tel:+9118001234567");
    expect(
      buildWarrantyClaimUrl({
        ...base,
        claimContact: "tel:+9118001234567",
      }),
    ).toBe("tel:+9118001234567");
  });

  it("returns null when claim contact is missing", () => {
    expect(buildWarrantyClaimUrl({ ...base, claimContact: null })).toBeNull();
    expect(buildWarrantyClaimUrl({ ...base, claimContact: "   " })).toBeNull();
  });

  it("returns null for unusable bare strings without @", () => {
    expect(
      buildWarrantyClaimUrl({ ...base, claimContact: "not-a-contact" }),
    ).toBeNull();
  });

  it("mailto-falls-back for @ handles that fail strict email regex", () => {
    const url = buildWarrantyClaimUrl({
      ...base,
      claimContact: "support@localhost",
    });
    expect(url).toMatch(/^mailto:support@localhost\?/);
  });

  it("omits optional order/coverage lines when absent", () => {
    const url = buildWarrantyClaimUrl({
      itemTitle: "Blender",
      provider: "Store",
      claimContact: "help@store.com",
    });
    const decoded = decodeURIComponent(url!);
    expect(decoded).not.toContain("Order / invoice");
    expect(decoded).not.toContain("Coverage until");
  });
});

describe("buildWarrantyClaimPacket (U011)", () => {
  it("includes email body + receipt attachment keys", () => {
    const packet = buildWarrantyClaimPacket({
      itemTitle: "Headphones",
      provider: "Croma",
      orderRef: "ORD-1",
      claimContact: "support@croma.com",
      receiptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      receiptImageKey: "receipts/user/abc.jpg",
    });
    expect(packet.emailBody).toContain("Headphones");
    expect(packet.attachmentKeys).toEqual([
      "receipts/user/abc.jpg",
      "receipt:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
    expect(packet.shareText).toContain("Attachments:");
    expect(packet.shareText).toContain("receipts/user/abc.jpg");
  });
});

describe("canUnclaimWarranty (U011)", () => {
  it("allows undo within 24h and rejects after", () => {
    const claimedAt = new Date("2026-08-27T00:00:00.000Z");
    expect(
      canUnclaimWarranty(claimedAt, new Date(claimedAt.getTime() + 60_000)),
    ).toBe(true);
    expect(
      canUnclaimWarranty(
        claimedAt,
        new Date(claimedAt.getTime() + WARRANTY_UNCLAIM_WINDOW_MS + 1),
      ),
    ).toBe(false);
  });
});

describe("defaultClaimContactFromMerchant", () => {
  it("slugs merchant into a support mailbox", () => {
    expect(defaultClaimContactFromMerchant("Mock Mart")).toBe(
      "support@mockmart.com",
    );
    expect(defaultClaimContactFromMerchant("Croma")).toBe("support@croma.com");
    expect(defaultClaimContactFromMerchant("   ")).toBe("support@merchant.com");
  });
});
