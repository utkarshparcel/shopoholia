import { describe, expect, it } from "vitest";
import {
  giftCardCapturePrefill,
  parseGiftCardBarcode,
  parseGiftCardCapture,
} from "./giftCardCapture.js";

describe("parseGiftCardCapture", () => {
  it("prefills merchant + last4 from a barcode payload", () => {
    const parsed = parseGiftCardCapture({
      barcode: "AMZN-GC-99887766",
    });
    expect(parsed.code).toBe("AMZNGC99887766");
    expect(parsed.codeLast4).toBe("7766");
    expect(parsed.merchant).toBe("Amazon");
  });

  it("detects merchant from OCR text and labeled code", () => {
    const parsed = parseGiftCardCapture({
      ocrText: "Amazon Gift Card\nCode: ABCD-1234-EFGH-5678\nBalance may vary",
    });
    expect(parsed.merchant).toBe("Amazon");
    expect(parsed.code).toBe("ABCD1234EFGH5678");
    expect(parsed.codeLast4).toBe("5678");
  });

  it("prefers barcode code when photo OCR also present", () => {
    const parsed = parseGiftCardCapture({
      barcode: "TARGET99881234",
      ocrText: "Target Gift Card Code: OTHER00001111",
      merchantHint: "Target",
    });
    expect(parsed.merchant).toBe("Target");
    expect(parsed.code).toBe("TARGET99881234");
    expect(parsed.codeLast4).toBe("1234");
  });

  it("uses merchantHint when OCR has no known brand", () => {
    const parsed = parseGiftCardCapture({
      merchantHint: "Local Boutique",
      ocrText: "Gift card PIN 99887766",
    });
    expect(parsed.merchant).toBe("Local Boutique");
    expect(parsed.codeLast4).toBe("7766");
  });

  it("parses MERCHANT|CODE barcode shape", () => {
    const parsed = parseGiftCardCapture({ barcode: "Myntra|MYNTRA998877" });
    expect(parsed.merchant).toBe("Myntra");
    expect(parsed.code).toBe("MYNTRA998877");
    expect(parsed.codeLast4).toBe("8877");
  });

  it("ignores empty / unknown-merchant hints and balance-like tokens", () => {
    expect(
      parseGiftCardCapture({
        merchantHint: "Unknown Merchant",
        ocrText: "BALANCE 500 EXPIRES SOON",
      }).merchant,
    ).toBeNull();
    expect(parseGiftCardCapture({ barcode: "   " }).code).toBeNull();
  });
});

describe("parseGiftCardBarcode / giftCardCapturePrefill", () => {
  it("exposes raw + last4 aliases from barcode helper", () => {
    const parsed = parseGiftCardBarcode("Flipkart GC-11223344");
    expect(parsed.merchant).toBe("Flipkart");
    expect(parsed.raw).toContain("Flipkart");
    expect(parsed.last4).toBe(parsed.codeLast4);
  });

  it("prefill prefers barcode raw then OCR text", () => {
    expect(
      giftCardCapturePrefill({
        barcode: "AMZN99887766",
        ocrText: "ignored for raw",
      }).raw,
    ).toBe("AMZN99887766");
    expect(
      giftCardCapturePrefill({
        ocrText: "Starbucks Code: SBX998877",
      }).merchant,
    ).toBe("Starbucks");
    expect(giftCardCapturePrefill({}).raw).toBeNull();
  });
});
