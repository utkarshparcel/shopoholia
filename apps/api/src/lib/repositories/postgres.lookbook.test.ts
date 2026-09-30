import { randomInt, randomUUID } from "node:crypto";
import { createDb, listings, lookbookItems, users } from "@worn/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { ListingRecord, Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("Postgres lookbook", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  const db = databaseUrl ? createDb(databaseUrl) : null!;

  async function newUser() {
    const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    return user;
  }

  async function draftListings(count: number) {
    const rows: ListingRecord[] = Array.from({ length: count }, () => ({
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
      // Kept out of the feed so these rows can't be mistaken for the real catalog.
      status: "DRAFT",
      sortOrder: 0,
      createdAt: new Date(),
    }));
    await repos.seedListings(rows, []);
    return rows.map((row) => row.id);
  }

  async function savedIds(userId: string, r: Repositories = repos) {
    return (await r.listLookbookListings(userId)).map((listing) => listing.id);
  }

  it("saves, lists newest first, and removes", async () => {
    const user = await newUser();
    const [a, b, c] = await draftListings(3);

    for (const id of [a, b, c]) await repos.saveLookbookItem(user.id, id!);
    expect(await savedIds(user.id)).toEqual([c, b, a]);
    expect(await repos.listLookbookListings(user.id)).toMatchObject([
      { id: c, status: "DRAFT", title: "Test tee" },
      { id: b },
      { id: a },
    ]);

    await repos.removeLookbookItem(user.id, b!);
    expect(await savedIds(user.id)).toEqual([c, a]);
  });

  it("keeps the original save time on a repeat save; removes are idempotent", async () => {
    const user = await newUser();
    const [a, b] = await draftListings(2);

    await repos.saveLookbookItem(user.id, a!);
    await repos.saveLookbookItem(user.id, b!);
    await repos.saveLookbookItem(user.id, a!);
    expect(await savedIds(user.id)).toEqual([b, a]);

    await repos.removeLookbookItem(user.id, a!);
    await repos.removeLookbookItem(user.id, a!);
    await repos.removeLookbookItem(user.id, randomUUID());
    expect(await savedIds(user.id)).toEqual([b]);
  });

  it("keeps saved items across a restart", async () => {
    const user = await newUser();
    const [a, b] = await draftListings(2);
    await repos.saveLookbookItem(user.id, a!);
    await repos.saveLookbookItem(user.id, b!);

    // A new repository instance with its own connection pool, as after a restart.
    const after = createPostgresRepositoriesFromUrl(databaseUrl!);
    expect(await savedIds(user.id, after)).toEqual([b, a]);
  });

  it("keeps each user's lookbook separate", async () => {
    const alice = await newUser();
    const bob = await newUser();
    const [a] = await draftListings(1);

    await repos.saveLookbookItem(alice.id, a!);
    await repos.removeLookbookItem(bob.id, a!);

    expect(await savedIds(alice.id)).toEqual([a]);
    expect(await savedIds(bob.id)).toEqual([]);
  });

  it("rejects a listing that doesn't exist", async () => {
    const user = await newUser();
    await expect(repos.saveLookbookItem(user.id, randomUUID())).rejects.toThrow();
    expect(await savedIds(user.id)).toEqual([]);
  });

  it("drops saved items when their listing or user is deleted", async () => {
    const user = await newUser();
    const other = await newUser();
    const [a, b] = await draftListings(2);
    await repos.saveLookbookItem(user.id, a!);
    await repos.saveLookbookItem(user.id, b!);
    await repos.saveLookbookItem(other.id, a!);

    await db.delete(listings).where(eq(listings.id, a!));
    expect(await savedIds(user.id)).toEqual([b]);
    expect(await savedIds(other.id)).toEqual([]);

    await db.delete(users).where(eq(users.id, user.id));
    const rows = await db.select().from(lookbookItems).where(eq(lookbookItems.userId, user.id));
    expect(rows).toEqual([]);
    await db.delete(listings).where(eq(listings.id, b!));
  });
});
