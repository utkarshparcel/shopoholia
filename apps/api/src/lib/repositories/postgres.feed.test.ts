import { randomUUID } from "node:crypto";
import { createDb, listings } from "@worn/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { ListingRecord, ListListingsInput, Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// These rows share the database with other suites and the real catalog: unique
// categories and words keep them apart, and sortOrders near the int32 ceiling put them
// after every real listing. They're deleted again in afterAll.
const run = randomUUID().slice(0, 8);
const TOPS = `feedtest-${run}-tops`;
const DRESSES = `feedtest-${run}-dresses`;
const TOKEN = `zq${run}`;
const BASE = 2_000_000_000;

function listing(
  category: string,
  offset: number,
  title: string,
  overrides: Partial<ListingRecord> = {},
): ListingRecord {
  return {
    id: randomUUID(),
    sellerId: null,
    title,
    category,
    tags: [],
    coinPrice: 40,
    realPrice: null,
    productImageKeys: [],
    houseModelRenderKey: "https://cdn.example.com/listing.jpg",
    affiliateUrl: null,
    affiliateLinks: null,
    status: "ACTIVE",
    sortOrder: BASE + offset,
    createdAt: new Date(),
    ...overrides,
  };
}

const black = listing(TOPS, 0, "BLACK Crêpe Shell");
const grey = listing(TOPS, 1, "Dark Grey Graphic Printed T-Shirt", { tags: ["src:newme"] });
const tiered = listing(TOPS, 1, "Tiered Teen Top", { tags: ["night-out"] });
const plain = listing(TOPS, 2, `Plain ${TOKEN} Top`);
const offWhite = listing(TOPS, 3, "Off-White Co-Ord Set");
const orange = listing(TOPS, 4, "Orange Keyhole Top", { tags: ["Neutral"] });
const strasse = listing(TOPS, 5, "Straße Tie-Dye Tank");
const draft = listing(TOPS, 6, "White Draft Top", { status: "DRAFT" });
const red = listing(DRESSES, 0, "Red Draped Mini Dress");
const beige = listing(DRESSES, 2, `Beige ${TOKEN} Maxi Dress`);
const sage = listing(DRESSES, 2, "Sage Bodycon Dress", { tags: ["party"] });
const archived = listing(DRESSES, 3, "Ivory Archived Gown", { status: "ARCHIVED" });
const fixtures = [black, grey, tiered, plain, offWhite, orange, strasse, draft, red, beige, sage, archived];

const NEUTRAL = ["black", "white", "off white", "beige", "grey", "neutral"];
const KEYWORD_SETS = [
  [],
  NEUTRAL,
  ["party", "Night Out", "bodycon", "tie-dye"],
  ["tee", "t shirt"],
  ["Straße"],
  [TOKEN],
];

const catalogOrder = (a: ListingRecord, b: ListingRecord) =>
  a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1);
const ids = (items: ListingRecord[]) => items.map((item) => item.id);

async function readAll(repos: Repositories, input: Omit<ListListingsInput, "cursor">) {
  const items: ListingRecord[] = [];
  const cursors: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 500; page += 1) {
    const result = await repos.listListings({ ...input, cursor });
    items.push(...result.items);
    if (!result.nextCursor) return { items, cursors };
    cursors.push(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error("feed never ended");
}

describePostgres("createPostgresRepositories: feed", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;

  beforeAll(async () => {
    await repos.seedListings(fixtures, []);
  });

  afterAll(async () => {
    await createDb(databaseUrl!).delete(listings).where(inArray(listings.id, ids(fixtures)));
  });

  it("filters by exact category and counts active listings per category", async () => {
    const { items } = await readAll(repos, { limit: 2, category: DRESSES });
    expect(ids(items)).toEqual(ids([red, beige, sage].sort(catalogOrder)));
    expect((await repos.listListings({ limit: 5, category: DRESSES.toUpperCase() })).items).toEqual([]);

    const categories = await repos.listListingCategories();
    expect(categories).toContainEqual({ category: TOPS, count: 7 });
    expect(categories).toContainEqual({ category: DRESSES, count: 3 });
    const sorted = [...categories].sort(
      (a, b) => b.count - a.count || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0),
    );
    expect(categories).toEqual(sorted);
  });

  it("ranks matching listings first in SQL, each group in catalog order", async () => {
    const page = await repos.listListings({ limit: 20, category: TOPS, styleKeywords: NEUTRAL });
    expect(ids(page.items)).toEqual(
      ids([
        ...[black, grey, offWhite, orange].sort(catalogOrder),
        ...[tiered, plain, strasse].sort(catalogOrder),
      ]),
    );
  });

  it("pages across the matching/non-matching boundary without duplicates or gaps", async () => {
    const expected = ids((await repos.listListings({ limit: 50, category: TOPS, styleKeywords: NEUTRAL })).items);
    for (let limit = 1; limit <= expected.length + 1; limit += 1) {
      const { items, cursors } = await readAll(repos, { limit, category: TOPS, styleKeywords: NEUTRAL });
      expect(ids(items), `limit ${limit}`).toEqual(expected);
      expect(cursors.every((cursor) => /^[01]:\d+:[0-9a-f-]{36}$/.test(cursor))).toBe(true);
    }
    const { cursors } = await readAll(repos, { limit: 1, category: TOPS, styleKeywords: NEUTRAL });
    expect(cursors.map((cursor) => cursor[0]).join("")).toBe("111100");
  });

  it("ranks across the whole feed, ahead of the rest of the catalog", async () => {
    const tokenMatches = [plain, beige].sort(catalogOrder);
    const first = await repos.listListings({ limit: 2, styleKeywords: [TOKEN] });
    expect(ids(first.items)).toEqual(ids(tokenMatches));

    const { items } = await readAll(repos, { limit: 50, styleKeywords: [TOKEN] });
    expect(new Set(ids(items)).size).toBe(items.length);
    const ours = new Set(ids(fixtures));
    const rest = [black, grey, tiered, offWhite, orange, strasse, red, sage].sort(catalogOrder);
    expect(ids(items).filter((id) => ours.has(id))).toEqual(ids([...tokenMatches, ...rest]));
  });

  it("keeps old catalog-order cursors in catalog order, and ranked ones without keywords", async () => {
    const tops = [black, grey, tiered, plain, offWhite, orange, strasse].sort(catalogOrder);

    const plainPage = await repos.listListings({ limit: 2, category: TOPS });
    expect(plainPage.nextCursor).toBe(`${tops[1]!.sortOrder}:${tops[1]!.id}`);
    const ranked = await repos.listListings({
      limit: 10,
      category: TOPS,
      cursor: plainPage.nextCursor!,
      styleKeywords: NEUTRAL,
    });
    expect(ids(ranked.items)).toEqual(ids(tops.slice(2)));

    const rankedPage = await repos.listListings({ limit: 1, category: TOPS, styleKeywords: NEUTRAL });
    expect(rankedPage.nextCursor).toBe(`1:${black.sortOrder}:${black.id}`);
    const anonymous = await repos.listListings({ limit: 10, category: TOPS, cursor: rankedPage.nextCursor! });
    expect(ids(anonymous.items)).toEqual(ids(tops.slice(1)));
  });

  it("starts over on a malformed cursor instead of failing the query", async () => {
    const first = await repos.listListings({ limit: 3, category: TOPS });
    for (const cursor of ["5:not-a-uuid", "garbage", `1:${BASE}:${black.id}:x`, `9:${BASE}:${black.id}`]) {
      expect(await repos.listListings({ limit: 3, category: TOPS, cursor })).toEqual(first);
    }
  });

  it("matches, ranks and paginates exactly like the memory repositories", async () => {
    const memory = createMemoryRepositories();
    await memory.seedListings(fixtures, []);

    for (const category of [TOPS, DRESSES]) {
      for (const styleKeywords of KEYWORD_SETS) {
        for (const limit of [1, 2, 3, 50]) {
          const input = { limit, category, styleKeywords };
          const [fromPostgres, fromMemory] = await Promise.all([readAll(repos, input), readAll(memory, input)]);
          const label = `${category} ${JSON.stringify(styleKeywords)} limit ${limit}`;
          expect(ids(fromPostgres.items), label).toEqual(ids(fromMemory.items));
          expect(fromPostgres.cursors, label).toEqual(fromMemory.cursors);
        }
      }
    }
  });
});
