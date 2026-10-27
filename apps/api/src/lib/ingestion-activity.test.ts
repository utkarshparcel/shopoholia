import { describe, expect, it } from "vitest";
import { toIngestionActivityItem } from "./ingestion-activity.js";
import type { IngestionDocumentRecord, MerchantPurchaseRecord } from "./repositories/types.js";

const baseDoc = (overrides: Partial<IngestionDocumentRecord> = {}): IngestionDocumentRecord => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "EMAIL",
  rawKey: "raw/secret",
  parsedJson: {
    __userId: "user-1",
    merchant: "Amazon",
    subject: "Your Amazon.in order",
    body: "A".repeat(300),
    totalMinor: 49900,
    currency: "INR",
    accessToken: "should-never-leak",
  },
  matchedPurchaseId: null,
  status: "MATCHED",
  createdAt: new Date("2024-06-01T12:00:00.000Z"),
  updatedAt: new Date("2024-06-01T12:00:00.000Z"),
  ...overrides,
});

describe("toIngestionActivityItem", () => {
  it("returns truncated subject/snippet without raw body or tokens", () => {
    const item = toIngestionActivityItem(baseDoc());
    expect(item.merchant).toBe("Amazon");
    expect(item.subject).toBe("Your Amazon.in order");
    expect(item.snippet).toBeNull();
    expect(JSON.stringify(item)).not.toContain("accessToken");
    expect(JSON.stringify(item)).not.toContain("should-never-leak");
    expect(JSON.stringify(item)).not.toContain("raw/secret");
    expect(JSON.stringify(item)).not.toContain("A".repeat(50));
    expect(item.totalMinor).toBe(49900);
    expect(item.currency).toBe("INR");
  });

  it("truncates SMS body into snippet", () => {
    const item = toIngestionActivityItem(
      baseDoc({
        kind: "SMS",
        parsedJson: {
          from: "+919999999999",
          body: "B".repeat(300),
          merchant: "Flipkart",
        },
      }),
    );
    expect(item.snippet!.endsWith("…")).toBe(true);
    expect(item.snippet!.length).toBeLessThanOrEqual(160);
    expect(item.subject).toBe("SMS from +919999999999");
  });

  it("falls back to linked purchase merchant/total", () => {
    const purchase: MerchantPurchaseRecord = {
      id: "22222222-2222-4222-8222-222222222222",
      userId: "user-1",
      source: "EMAIL",
      merchant: "Flipkart",
      orderRef: null,
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 1200,
      status: "CONFIRMED",
      rawDocId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const item = toIngestionActivityItem(
      baseDoc({ parsedJson: { __userId: "user-1", subject: "Order" }, matchedPurchaseId: purchase.id }),
      purchase,
    );
    expect(item.merchant).toBe("Flipkart");
    expect(item.totalMinor).toBe(1200);
  });
});
