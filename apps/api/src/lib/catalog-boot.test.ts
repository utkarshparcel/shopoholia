import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ONBOARDING_COIN_GRANT } from "@worn/shared";
import { describe, expect, it, vi } from "vitest";
import { maybeSeedCatalog } from "./deps.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import { BUNDLED_SCRAPED_CATALOG_PATH, mapScrapedRowToRecords } from "./seed/scraped.js";
import { createMockStorage } from "./storage/r2.js";
import type { ListingRecord } from "./repositories/types.js";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function placeholderListing(): ListingRecord {
  return {
    id: randomUUID(),
    sellerId: null,
    title: "R2 keyed tee",
    category: "tops",
    tags: [],
    coinPrice: 40,
    realPrice: null,
    productImageKeys: ["catalog/tee.jpg"],
    houseModelRenderKey: "house-models/tee.jpg",
    affiliateUrl: null,
    affiliateLinks: null,
    status: "ACTIVE",
    sortOrder: 0,
    createdAt: new Date(),
  };
}

describe("catalog at boot in production", () => {
  it("never clears an existing catalog, whatever its image keys", async () => {
    const repos = createMemoryRepositories();
    const listing = placeholderListing();
    await repos.seedListings([listing], []);
    const clear = vi.spyOn(repos, "clearCatalog");

    await maybeSeedCatalog(repos, createMockStorage(), { NODE_ENV: "production" });

    expect(clear).not.toHaveBeenCalled();
    const page = await repos.listListings({ limit: 50 });
    expect(page.items.map((item) => item.id)).toEqual([listing.id]);
  });

  it("fills an empty catalog from the catalog file only, never with synthetic fixtures", async () => {
    const repos = createMemoryRepositories();
    await maybeSeedCatalog(repos, createMockStorage(), {
      NODE_ENV: "production",
      CATALOG_SEED_FILE: BUNDLED_SCRAPED_CATALOG_PATH,
    });
    const page = await repos.listListings({ limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item) => /^https:\/\//.test(item.houseModelRenderKey))).toBe(true);
  });

  it("seeds nothing when no catalog file can be found", async () => {
    const repos = createMemoryRepositories();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeSeedCatalog(repos, createMockStorage(), {
      NODE_ENV: "production",
      CATALOG_SEED_FILE: "/nonexistent/catalog.jsonl",
    }).catch(() => {});
    warn.mockRestore();
    const page = await repos.listListings({ limit: 50 });
    expect(page.items.every((item) => !item.houseModelRenderKey.startsWith("house-models/"))).toBe(true);
  });

  it("ships the bundled catalog file in the build output", () => {
    const pkg = JSON.parse(readFileSync(join(apiRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const copied = relative(apiRoot, BUNDLED_SCRAPED_CATALOG_PATH).replaceAll("\\", "/");
    expect(existsSync(BUNDLED_SCRAPED_CATALOG_PATH)).toBe(true);
    expect(pkg.scripts.build).toContain("copy-build-assets");
    const script = readFileSync(join(apiRoot, "scripts/copy-build-assets.mjs"), "utf8");
    expect(script).toContain(copied.replace(/^src\//, ""));
  });
});

describe("scraped catalog prices", () => {
  it("shows the partner's own rupee price, not a multiple of it", () => {
    const { listing } = mapScrapedRowToRecords(
      {
        title: "Black Solid One Shoulder Top",
        category: "tops",
        tags: [],
        image_urls: ["https://assets.newme.asia/a.webp"],
        affiliate_url: "https://newme.asia/product/a",
        source: "newme",
        coin_price: 405,
      },
      0,
      0,
    );
    expect(listing.realPrice).toBe("₹405");
    // ...and costs about a coin per ₹10 of it.
    expect(listing.coinPrice).toBe(40);
  });

  it("prices the bundled catalog so the welcome grant buys a first haul of several pieces", async () => {
    const repos = createMemoryRepositories();
    await maybeSeedCatalog(repos, createMockStorage(), {
      NODE_ENV: "production",
      CATALOG_SEED_FILE: BUNDLED_SCRAPED_CATALOG_PATH,
    });
    const prices = (await repos.listListings({ limit: 50 })).items.map((item) => item.coinPrice);
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    expect(Math.floor(ONBOARDING_COIN_GRANT / average)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...prices)).toBeLessThan(ONBOARDING_COIN_GRANT / 2);
  });

  it("leaves the partner price unknown when the row has none", () => {
    const { listing } = mapScrapedRowToRecords(
      {
        title: "Top",
        category: "tops",
        tags: [],
        image_urls: ["https://assets.newme.asia/a.webp"],
        affiliate_url: "https://newme.asia/product/a",
        source: "newme",
      },
      0,
      0,
    );
    expect(listing.realPrice).toBeNull();
  });
});
