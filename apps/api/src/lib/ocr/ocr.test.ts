import { describe, expect, it, vi } from "vitest";
import {
  createOcrClientFromEnv,
  MockOcrClient,
  HostedOcrClient,
  OcrUnavailableError,
  UnavailableOcrClient,
} from "./index.js";
import { normalizeHostedResponse } from "./hosted.js";

describe("ocr", () => {
  it("mock OCR returns structured fields with confidence always", async () => {
    const client = new MockOcrClient();
    const result = await client.recognize("receipts/demo.jpg");
    expect(result.merchant).toBe("Mock Mart");
    expect(result.totalMinor).toBe(129900);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      title: expect.any(String),
      priceMinor: expect.any(Number),
    });
    expect(result.confidence).toBe(0.92);
    expect(typeof result.confidence).toBe("number");
    expect(result.warrantyHint).toBeNull();
    expect(result.claimContactHint).toBeNull();
    expect(result.raw.source).toBe("mock");
  });

  it("mock OCR returns care-label text for wash-label keys", async () => {
    const result = await new MockOcrClient().recognize("care-tags/user/wash-label.jpg");
    expect(result.confidence).toBe(0.91);
    expect(result.raw.text).toContain("Machine wash cold");
    expect(result.raw.careLabel).toBe(true);
  });

  it("defaults to mock when OCR_PROVIDER_URL is unset", () => {
    const client = createOcrClientFromEnv({});
    expect(client).toBeInstanceOf(MockOcrClient);
  });

  it("uses mock when OCR_PROVIDER=mock even if URL is set", () => {
    const client = createOcrClientFromEnv({
      OCR_PROVIDER: "mock",
      OCR_PROVIDER_URL: "https://ocr.example/v1",
    });
    expect(client).toBeInstanceOf(MockOcrClient);
  });

  it("uses hosted when OCR_PROVIDER_URL is set", () => {
    const client = createOcrClientFromEnv({
      OCR_PROVIDER_URL: "https://ocr.example/v1/recognize",
      OCR_PROVIDER_API_KEY: "key",
    });
    expect(client).toBeInstanceOf(HostedOcrClient);
  });

  it("uses hosted from OCR_PROVIDER_ENDPOINT alias without explicit provider", () => {
    const client = createOcrClientFromEnv({
      OCR_PROVIDER_ENDPOINT: "https://ocr.example/legacy",
    });
    expect(client).toBeInstanceOf(HostedOcrClient);
  });

  it("falls back to mock when hosted is requested without URL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = createOcrClientFromEnv({ OCR_PROVIDER: "hosted" });
    expect(client).toBeInstanceOf(MockOcrClient);
    warn.mockRestore();
  });

  it("never uses the mock in production: no URL, or OCR_PROVIDER=mock, is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const env of [
      { NODE_ENV: "production" },
      { NODE_ENV: "production", OCR_PROVIDER: "mock", OCR_PROVIDER_URL: "https://ocr.example/v1" },
      { NODE_ENV: "production", OCR_PROVIDER: "hosted" },
    ]) {
      const client = createOcrClientFromEnv(env);
      expect(client).toBeInstanceOf(UnavailableOcrClient);
      await expect(client.recognize("care-tags/u/tag.jpg")).rejects.toBeInstanceOf(OcrUnavailableError);
    }
    expect(
      createOcrClientFromEnv({ NODE_ENV: "production", OCR_PROVIDER_URL: "https://ocr.example/v1" }),
    ).toBeInstanceOf(HostedOcrClient);
    warn.mockRestore();
  });

  it("hosted client gives up on a provider that doesn't answer", async () => {
    const client = new HostedOcrClient({
      url: "https://ocr.example/v1",
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        throw new DOMException("The operation timed out.", "TimeoutError");
      }) as unknown as typeof fetch,
    });
    await expect(client.recognize("care-tags/u/tag.jpg")).rejects.toThrow(/timed out/);
  });

  it("hosted client POSTs to OCR_PROVIDER_URL and maps generic JSON with confidence", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        merchant: "Vision Mart",
        totalMinor: 4200,
        confidence: 0.88,
        items: [{ title: "Socks", priceMinor: 4200, category: "bottom" }],
        warrantyHint: null,
      }),
    })) as unknown as typeof fetch;

    const client = new HostedOcrClient({
      url: "https://ocr.example/v1/recognize",
      apiKey: "test-key",
      fetchImpl,
    });
    const result = await client.recognize("receipts/a.jpg");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://ocr.example/v1/recognize",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-key" }),
      }),
    );
    expect(result.merchant).toBe("Vision Mart");
    expect(result.confidence).toBe(0.88);
    expect(result.items[0]!.title).toBe("Socks");
  });

  it("hosted client throws when URL missing or provider returns non-OK", async () => {
    await expect(new HostedOcrClient({}).recognize("x")).rejects.toThrow(/OCR_PROVIDER_URL/);

    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({}),
    })) as unknown as typeof fetch;
    await expect(
      new HostedOcrClient({ url: "https://ocr.example/v1", fetchImpl }).recognize("x"),
    ).rejects.toThrow(/500/);
  });

  it("hosted client posts google-vision payload shape when format set", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        responses: [{ textAnnotations: [{ description: "Nike\nShoes\nTotal 99.00" }] }],
      }),
    })) as unknown as typeof fetch;

    const client = new HostedOcrClient({
      endpoint: "https://vision.example/v1",
      format: "google-vision",
      fetchImpl,
    });
    const result = await client.recognize("gs://bucket/receipt.jpg");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://vision.example/v1",
      expect.objectContaining({
        body: expect.stringContaining("DOCUMENT_TEXT_DETECTION"),
      }),
    );
    expect(result.merchant).toBe("Nike");
    expect(result.totalMinor).toBe(9900);
  });

  it("hosted normalize always supplies a confidence number when provider omits it", () => {
    const result = normalizeHostedResponse({
      merchant: "X",
      items: [{ title: "Y", priceMinor: 100 }],
    });
    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("normalizes Google Vision annotate responses", () => {
    const result = normalizeHostedResponse(
      {
        responses: [
          {
            fullTextAnnotation: {
              text: "Croma\nWireless Mouse\nTotal 1499.00",
            },
          },
        ],
      },
      "google-vision",
    );
    expect(result.merchant).toBe("Croma");
    expect(result.totalMinor).toBe(149900);
    expect(result.confidence).toBe(0.8);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("falls back to textAnnotations and empty text confidence", () => {
    const fromAnnotations = normalizeHostedResponse(
      {
        responses: [{ textAnnotations: [{ description: "Apple\nAirPods\nAmount 199.00" }] }],
        items: [{ title: "AirPods", priceMinor: 19900 }],
      },
      "google-vision",
    );
    expect(fromAnnotations.merchant).toBe("Apple");
    expect(fromAnnotations.items[0]!.title).toBe("AirPods");

    const empty = normalizeHostedResponse({ responses: [{}] }, "google-vision");
    expect(empty.merchant).toBe("Unknown Merchant");
    expect(empty.confidence).toBe(0.5);
  });
});
