import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "../repositories/memory.js";
import {
  BUNDLED_SCRAPED_CATALOG_PATH,
  filterRealCatalogRows,
  isRealProductImageUrl,
  parseCatalogJsonl,
  seedScrapedCatalog,
} from "./scraped.js";
import { readFile } from "node:fs/promises";

describe("scraped catalog seed", () => {
  it("treats newme CDN urls as real product images", () => {
    expect(
      isRealProductImageUrl(
        "https://assets.newme.asia/wp-content/uploads/2026/01/141248540d8de836/NM-IN-56-BLS-25-OCT-25336-BLACK(1).webp",
      ),
    ).toBe(true);
    expect(isRealProductImageUrl("https://picsum.photos/seed/worn/533/800")).toBe(false);
  });

  it("loads bundled scraped rows with real images", async () => {
    const content = await readFile(BUNDLED_SCRAPED_CATALOG_PATH, "utf8");
    const rows = filterRealCatalogRows(parseCatalogJsonl(content));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => isRealProductImageUrl(r.image_urls[0]!))).toBe(true);
  });

  it("seeds repositories with https image keys", async () => {
    const repos = createMemoryRepositories();
    const result = await seedScrapedCatalog(repos, {
      env: { CATALOG_SEED_FILE: BUNDLED_SCRAPED_CATALOG_PATH },
    });
    expect(result).not.toBeNull();
    expect(result!.listings.length).toBeGreaterThan(0);
    expect(result!.listings[0]!.houseModelRenderKey).toMatch(/^https:\/\//);
    expect(result!.listings[0]!.houseModelRenderKey).not.toContain("picsum");
  });
});
