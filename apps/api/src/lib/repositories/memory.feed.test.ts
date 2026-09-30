import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import type { ListingRecord, ListListingsInput, Repositories } from "./types.js";

function listing(sortOrder: number, title: string, overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: randomUUID(),
    sellerId: null,
    title,
    category: "tops",
    tags: [],
    coinPrice: 40,
    realPrice: null,
    productImageKeys: [],
    houseModelRenderKey: "https://cdn.example.com/listing.jpg",
    affiliateUrl: null,
    affiliateLinks: null,
    status: "ACTIVE",
    sortOrder,
    createdAt: new Date(),
    ...overrides,
  };
}

// Catalog order is sortOrder, then id: two pairs share a sortOrder to exercise the tiebreak.
const catalog = [
  listing(0, "Red Draped Detail Mini Dress", { category: "dresses" }),
  listing(1, "Black Solid One Shoulder Top"),
  listing(2, "Blue High-Rise Bootcut Pants", { category: "bottoms" }),
  listing(3, "Off-White Striped Maxi Dress", { category: "dresses" }),
  listing(3, "Yellow Square Neck Top"),
  listing(4, "Dark Grey Graphic Printed T-Shirt"),
  listing(4, "Orange Keyhole Top", { tags: ["src:newme", "Neutral"] }),
  listing(5, "Sage Ruched Bodycon Mini Dress", { category: "dresses" }),
  listing(6, "Linen Wrap", { category: "Neutral Basics" }),
  listing(7, "Beige Leopard Print Maxi Dress", { category: "dresses" }),
  listing(8, "White Draft Top", { status: "DRAFT" }),
  listing(9, "White Archived Dress", { status: "ARCHIVED", category: "dresses" }),
];
const [red, black, blue, offWhite, yellow, grey, orange, sage, linen, beige] = catalog;
const NEUTRAL = ["black", "white", "off white", "beige", "grey", "neutral"];

const byCatalogOrder = (a: ListingRecord, b: ListingRecord) =>
  a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1);
const titles = (items: ListingRecord[]) => items.map((item) => item.title);

async function seededRepos() {
  const repos = createMemoryRepositories();
  await repos.seedListings(catalog, []);
  return repos;
}

/** Follows nextCursor to the end, returning every item and the cursors handed out. */
async function readAll(repos: Repositories, input: Omit<ListListingsInput, "cursor">) {
  const items: ListingRecord[] = [];
  const cursors: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const result = await repos.listListings({ ...input, cursor });
    items.push(...result.items);
    if (!result.nextCursor) return { items, cursors };
    cursors.push(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error("feed never ended");
}

describe("memory repositories: feed", () => {
  it("lists active listings in catalog order with sortOrder:id cursors", async () => {
    const repos = await seededRepos();
    const { items, cursors } = await readAll(repos, { limit: 3 });
    expect(titles(items)).toEqual(titles([...catalog.slice(0, 10)].sort(byCatalogOrder)));
    expect(cursors.every((cursor) => /^\d+:[0-9a-f-]{36}$/.test(cursor))).toBe(true);
  });

  it("filters by exact category across pages", async () => {
    const repos = await seededRepos();
    const { items } = await readAll(repos, { limit: 1, category: "dresses" });
    expect(titles(items)).toEqual(titles([red, offWhite, sage, beige]));
    expect((await repos.listListings({ limit: 10, category: "Dresses" })).items).toEqual([]);
  });

  it("counts categories of active listings, largest first", async () => {
    const repos = await seededRepos();
    await repos.seedListings([listing(10, "Knit", { category: "Tops" })], []);
    // Drafts and archived listings don't count; ties go by code unit, capitals first.
    expect(await repos.listListingCategories()).toEqual([
      { category: "dresses", count: 4 },
      { category: "tops", count: 4 },
      { category: "Neutral Basics", count: 1 },
      { category: "Tops", count: 1 },
      { category: "bottoms", count: 1 },
    ]);
  });

  it("ranks listings matching the style keywords first, each group in catalog order", async () => {
    const repos = await seededRepos();
    const page = await repos.listListings({ limit: 20, styleKeywords: NEUTRAL });
    const matching = [black, offWhite, grey, orange, linen, beige].sort(byCatalogOrder);
    const rest = [red, blue, yellow, sage].sort(byCatalogOrder);
    expect(titles(page.items)).toEqual(titles([...matching, ...rest]));
    expect(page.nextCursor).toBeNull();
  });

  it("pages through the ranked feed at any page size without duplicates or gaps", async () => {
    const repos = await seededRepos();
    const expected = titles((await repos.listListings({ limit: 50, styleKeywords: NEUTRAL })).items);

    for (let limit = 1; limit <= expected.length + 1; limit += 1) {
      const { items, cursors } = await readAll(repos, { limit, styleKeywords: NEUTRAL });
      expect(titles(items), `limit ${limit}`).toEqual(expected);
      expect(cursors.every((cursor) => /^[01]:\d+:[0-9a-f-]{36}$/.test(cursor))).toBe(true);
    }

    // With a page size of 1, the cursor flips from matching to not after the sixth item.
    const { cursors } = await readAll(repos, { limit: 1, styleKeywords: NEUTRAL });
    expect(cursors.map((cursor) => cursor[0]).join("")).toBe("111111000");
  });

  it("ranks within a category", async () => {
    const repos = await seededRepos();
    const { items } = await readAll(repos, { limit: 2, category: "dresses", styleKeywords: NEUTRAL });
    expect(titles(items)).toEqual(titles([offWhite, beige, red, sage]));
  });

  it("keeps an old sortOrder:id cursor in catalog order even when ranking applies", async () => {
    const repos = await seededRepos();
    const first = await repos.listListings({ limit: 4 });
    const next = await repos.listListings({ limit: 20, cursor: first.nextCursor!, styleKeywords: NEUTRAL });
    const catalogOrder = catalog.slice(0, 10).sort(byCatalogOrder);
    expect(titles(next.items)).toEqual(titles(catalogOrder.slice(4)));
    expect(next.nextCursor).toBeNull();
  });

  it("continues a ranked cursor in catalog order once the style keywords are gone", async () => {
    const repos = await seededRepos();
    const first = await repos.listListings({ limit: 2, styleKeywords: NEUTRAL });
    expect(first.nextCursor).toMatch(/^1:3:/);
    const next = await repos.listListings({ limit: 3, cursor: first.nextCursor! });
    const catalogOrder = catalog.slice(0, 10).sort(byCatalogOrder);
    const position = catalogOrder.findIndex((item) => item.id === first.items[1]!.id);
    expect(titles(next.items)).toEqual(titles(catalogOrder.slice(position + 1, position + 4)));
    expect(next.nextCursor).toMatch(/^\d+:[0-9a-f-]{36}$/);
  });

  it("starts over on a malformed cursor and ignores blank keywords", async () => {
    const repos = await seededRepos();
    const first = await repos.listListings({ limit: 2 });
    for (const cursor of [black.id, "garbage", `7:${black.id}:x`, `2:1:${black.id}`]) {
      expect((await repos.listListings({ limit: 2, cursor })).items).toEqual(first.items);
    }
    const blank = await repos.listListings({ limit: 2, styleKeywords: [" ", "--"] });
    expect(blank).toEqual(first);
  });

  it("combines the seller filter with category and ranking", async () => {
    const repos = await seededRepos();
    const sellerId = randomUUID();
    const own = [
      listing(20, "Seller Red Dress", { sellerId, category: "dresses" }),
      listing(21, "Seller Black Dress", { sellerId, category: "dresses" }),
      listing(22, "Seller Black Tee", { sellerId }),
    ];
    await repos.seedListings(own, []);
    const page = await repos.listListings({
      limit: 10,
      sellerId,
      category: "dresses",
      styleKeywords: NEUTRAL,
    });
    expect(titles(page.items)).toEqual(["Seller Black Dress", "Seller Red Dress"]);
  });
});
