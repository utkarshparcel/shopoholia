import { randomUUID } from "node:crypto";
import type { OcrClient, OcrResult } from "./index.js";

/**
 * Default OCR implementation. Deterministic and provider-free so the full
 * receipt → purchase → warranty pipeline works end-to-end and in tests without
 * any external dependency.
 *
 * The result is derived from the image key (not the pixels) so it is stable
 * across calls for the same upload — this mirrors what a real OCR engine would
 * return: a merchant, a total, per-line items, and a confidence score.
 * Swap in `HostedOcrClient` by setting `OCR_PROVIDER_URL`.
 */
const WARRANTY_KEYWORDS = ["warranty", "guarantee", "coverage"];

export class MockOcrClient implements OcrClient {
  async recognize(imageKey: string): Promise<OcrResult> {
    const lower = imageKey.toLowerCase();
    const isGiftCard =
      lower.includes("gift-card") ||
      lower.includes("gift_card") ||
      lower.includes("/gift-cards/");
    if (isGiftCard) {
      return {
        merchant: "Amazon",
        totalMinor: 250_000,
        items: [],
        confidence: 0.88,
        warrantyHint: null,
        claimContactHint: null,
        raw: {
          source: "mock",
          imageKey,
          requestId: randomUUID(),
          giftCard: true,
          code: "AMZN-GC-99887766",
          codeLast4: "7766",
          confidence: 0.88,
        },
      };
    }

    const isCareTag =
      lower.includes("care") ||
      lower.includes("wash-label") ||
      lower.includes("wash_label") ||
      lower.includes("/care-tags/");
    if (isCareTag) {
      const text = [
        "Machine wash cold 30°C",
        "Non-chlorine bleach when needed",
        "Tumble dry low",
        "Cool iron",
        "Do not dry clean",
        "100% cotton",
      ].join("\n");
      return {
        merchant: undefined,
        totalMinor: undefined,
        items: [{ title: "Machine wash cold 30°C", priceMinor: 0, category: "care" }],
        confidence: 0.91,
        warrantyHint: null,
        claimContactHint: null,
        raw: {
          source: "mock",
          imageKey,
          requestId: randomUUID(),
          text,
          confidence: 0.91,
          careLabel: true,
        },
      };
    }

    // Heuristic: if imageKey hints at electronics, fabricate a warranty hint
    const isElectronics =
      lower.includes("electronics") ||
      lower.includes("phone") ||
      lower.includes("laptop");
    return {
      merchant: isElectronics ? "Croma" : "Mock Mart",
      totalMinor: 129900,
      items: [
        {
          title: isElectronics ? "Wireless Headphones" : "Cotton T-Shirt",
          priceMinor: 49900,
          category: isElectronics ? "electronics" : "top",
        },
        { title: "Denim Jeans", priceMinor: 80000, category: "bottom" },
      ],
      confidence: 0.92,
      warrantyHint: isElectronics ? { itemIndex: 0, months: 12 } : null,
      claimContactHint: isElectronics ? "support@croma.com" : null,
      gstin: "29AABCU9603R1ZM",
      raw: {
        source: "mock",
        imageKey,
        requestId: randomUUID(),
        confidence: 0.92,
        gstin: "29AABCU9603R1ZM",
        warrantyHint: isElectronics ? { itemIndex: 0, months: 12 } : null,
        claimContactHint: isElectronics ? "support@croma.com" : null,
        detectedWarrantyPhrase: isElectronics ? "1 year warranty" : null,
        keywords: WARRANTY_KEYWORDS,
      },
    };
  }
}
