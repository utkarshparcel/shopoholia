import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import type { ListingRecord, Repositories } from "./types.js";

function listingRecord(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: randomUUID(),
    sellerId: null,
    title: "Test tee",
    category: "Tops",
    tags: [],
    coinPrice: 40,
    realPrice: null,
    productImageKeys: [],
    houseModelRenderKey: "",
    affiliateUrl: null,
    affiliateLinks: null,
    status: "ACTIVE",
    sortOrder: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

async function seedListings(repos: Repositories, count: number, status: ListingRecord["status"] = "ACTIVE") {
  const listings = Array.from({ length: count }, () => listingRecord({ status }));
  await repos.seedListings(listings, []);
  return listings.map((listing) => listing.id);
}

async function savedIds(repos: Repositories, userId: string) {
  return (await repos.listLookbookListings(userId)).map((listing) => listing.id);
}

describe("memory lookbook", () => {
  it("saves, lists newest first, and removes", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919876543210");
    const [a, b, c] = await seedListings(repos, 3);

    // Saves made in the same millisecond still come back newest first.
    vi.useFakeTimers({ now: new Date("2026-09-29T12:00:00Z") });
    try {
      await repos.saveLookbookItem(user.id, a!);
      await repos.saveLookbookItem(user.id, b!);
    } finally {
      vi.useRealTimers();
    }
    await repos.saveLookbookItem(user.id, c!);
    expect(await savedIds(repos, user.id)).toEqual([c, b, a]);

    await repos.removeLookbookItem(user.id, b!);
    expect(await savedIds(repos, user.id)).toEqual([c, a]);
  });

  it("keeps the original save time on a repeat save and ignores unknown removes", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919876543210");
    const [a, b] = await seedListings(repos, 2);

    await repos.saveLookbookItem(user.id, a!);
    await repos.saveLookbookItem(user.id, b!);
    await repos.saveLookbookItem(user.id, a!);
    await repos.removeLookbookItem(user.id, randomUUID());
    await repos.removeLookbookItem("no-such-user", a!);

    expect(await savedIds(repos, user.id)).toEqual([b, a]);
  });

  it("returns saved listings whatever their status, per user", async () => {
    const repos = createMemoryRepositories();
    const { user: alice } = await repos.createUser("919000000001");
    const { user: bob } = await repos.createUser("919000000002");
    const [draft] = await seedListings(repos, 1, "DRAFT");

    await repos.saveLookbookItem(alice.id, draft!);

    expect(await repos.listLookbookListings(alice.id)).toMatchObject([{ id: draft, status: "DRAFT" }]);
    expect(await repos.listLookbookListings(bob.id)).toEqual([]);
  });

  it("rejects unknown listings and drops saves with the catalog, like the Postgres cascade", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919876543210");
    const [a] = await seedListings(repos, 1);

    await expect(repos.saveLookbookItem(user.id, randomUUID())).rejects.toThrow(/Listing not found/);

    await repos.saveLookbookItem(user.id, a!);
    await repos.clearCatalog();
    await repos.seedListings([listingRecord({ id: a! })], []);
    expect(await repos.listLookbookListings(user.id)).toEqual([]);
  });
});
