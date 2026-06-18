import { describe, expect, it } from "vitest";
import {
  detectAntiBotSignals,
  isExtractionComplete,
  mergeFields,
  parseJsonLdProduct,
  parseOgTags,
  toCatalogSample,
} from "../scrape-probes/probe-runner.js";

describe("detectAntiBotSignals", () => {
  it("flags captcha and cloudflare challenges", () => {
    const signals = detectAntiBotSignals(
      '<html><body>Checking your browser before accessing... cloudflare</body></html>',
      200,
    );
    expect(signals.cloudflare).toBe(true);
    expect(signals.captcha).toBe(false);
  });

  it("flags 403 and empty responses", () => {
    const signals = detectAntiBotSignals("", 403);
    expect(signals.forbidden403).toBe(true);
    expect(signals.empty).toBe(true);
  });
});

describe("parseJsonLdProduct", () => {
  it("extracts product fields from JSON-LD", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Test Dress","image":"https://cdn.example/dress.jpg",
       "offers":{"price":"999"},"url":"https://shop.example/dress"}
    </script>`;
    const fields = parseJsonLdProduct(html);
    expect(fields.title).toBe("Test Dress");
    expect(fields.price).toBe("999");
    expect(fields.images).toContain("https://cdn.example/dress.jpg");
    expect(fields.url).toBe("https://shop.example/dress");
  });
});

describe("parseOgTags", () => {
  it("reads og:title and og:image", () => {
    const html = `<meta property="og:title" content="OG Title" />
      <meta property="og:image" content="https://cdn.example/og.jpg" />`;
    const fields = parseOgTags(html);
    expect(fields.title).toBe("OG Title");
    expect(fields.images).toEqual(["https://cdn.example/og.jpg"]);
  });
});

describe("mergeFields and isExtractionComplete", () => {
  it("merges partial extractions", () => {
    const merged = mergeFields(
      { title: "A", images: [] },
      { images: ["https://img/1.jpg"], url: "https://x" },
    );
    expect(merged.title).toBe("A");
    expect(merged.url).toBe("https://x");
    expect(isExtractionComplete(merged)).toBe(true);
  });
});

describe("toCatalogSample", () => {
  it("maps extracted fields to import-catalog JSONL shape", () => {
    const sample = toCatalogSample(
      {
        title: "Probe Item",
        price: "₹1,299",
        images: ["https://cdn.example/a.jpg"],
        url: "https://shop.example/item",
      },
      "newme",
      "Dresses",
    );
    expect(sample).toMatchObject({
      title: "Probe Item",
      category: "Dresses",
      source: "newme",
      coin_price: 1299,
      affiliate_url: "https://shop.example/item",
    });
  });
});
