import { describe, expect, it } from "vitest";
import {
  buildManifest,
  buildSyntheticCatalogRows,
  dedupeKey,
  deduplicateRows,
} from "./build-catalog-dataset.js";
import type { CatalogImportRow } from "./import-catalog.js";

function sampleRow(overrides: Partial<CatalogImportRow> = {}): CatalogImportRow {
  return {
    title: "Test Item",
    category: "Tops",
    tags: [],
    image_urls: ["https://example.com/a.jpg"],
    affiliate_url: "https://shop.example/item",
    source: "newme",
    ...overrides,
  };
}

describe("deduplicateRows", () => {
  it("removes duplicate affiliate_url rows", () => {
    const rows = [
      sampleRow({ title: "A", affiliate_url: "https://shop.example/1" }),
      sampleRow({ title: "B", affiliate_url: "https://shop.example/1" }),
      sampleRow({ title: "C", affiliate_url: "https://shop.example/2" }),
    ];
    const deduped = deduplicateRows(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.title).toBe("A");
  });

  it("normalizes dedupe key case-insensitively", () => {
    expect(dedupeKey(sampleRow({ affiliate_url: "HTTPS://Shop.Example/Item" }))).toBe(
      "https://shop.example/item",
    );
  });
});

describe("buildSyntheticCatalogRows", () => {
  it("generates import-catalog rows tagged synthetic", () => {
    const rows = buildSyntheticCatalogRows(3);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.source).toBe("synthetic");
      expect(row.tags).toContain("synthetic");
      expect(row.image_urls[0]).toMatch(/^https:\/\//);
      expect(row.affiliate_url).toContain("worn.app/catalog/synthetic");
    }
  });
});

describe("buildManifest", () => {
  it("documents gap when below target", () => {
    const manifest = buildManifest(
      {
        target: 100_000,
        outputPath: "/tmp/out.jsonl",
        manifestPath: "/tmp/manifest.json",
        catalogDir: "/tmp/catalog",
        allowSynthetic: true,
        sources: [],
      },
      { newme: 20, shein: 0 },
      20,
      0,
      [{ id: "newme", path: "/tmp/newme.jsonl", rows: 20, present: true }],
    );
    expect(manifest.gap).toBe(99_980);
    expect(manifest.honestAssessment).toContain("Gap");
    expect(manifest.nextSteps.some((s) => s.includes("Bright Data"))).toBe(true);
  });

  it("notes synthetic backfill honestly", () => {
    const manifest = buildManifest(
      {
        target: 100,
        outputPath: "/tmp/out.jsonl",
        manifestPath: "/tmp/manifest.json",
        catalogDir: "/tmp/catalog",
        allowSynthetic: true,
        sources: [],
      },
      { newme: 10, synthetic: 90 },
      100,
      90,
      [],
    );
    expect(manifest.syntheticBackfill).toBe(90);
    expect(manifest.honestAssessment).toContain("synthetic");
  });
});
