import { randomUUID } from "node:crypto";
import { ListingCardSchema, type ListingCard } from "@worn/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import type { ListingRecord, Repositories } from "../lib/repositories/types.js";
import { seedCatalog } from "../lib/seed/catalog.js";
import { createMockStorage } from "../lib/storage/r2.js";

type App = Awaited<ReturnType<typeof buildServer>>;

async function login(app: App, phone = "919876543210") {
  await app.inject({ method: "POST", url: "/auth/otp", payload: { phone } });
  const verify = await app.inject({
    method: "POST",
    url: "/auth/verify",
    payload: { phone, otp: "123456" },
  });
  return { authorization: `Bearer ${(verify.json() as { accessToken: string }).accessToken}` };
}

describe("lookbook routes", () => {
  let app: App;
  let repos: Repositories;
  let listings: ListingRecord[];

  beforeEach(async () => {
    repos = createMemoryRepositories();
    const storage = createMockStorage();
    ({ listings } = await seedCatalog(repos, storage, 3, { preferScraped: false }));
    app = await buildServer({ logger: false, deps: { repos, storage } });
  });

  afterEach(async () => {
    await app.close();
  });

  async function lookbookIds(headers: { authorization: string }) {
    const res = await app.inject({ method: "GET", url: "/lookbook", headers });
    expect(res.statusCode).toBe(200);
    return (res.json() as { items: ListingCard[] }).items.map((item) => item.id);
  }

  async function setStatus(listing: ListingRecord, status: ListingRecord["status"]) {
    await repos.seedListings([{ ...listing, status }], []);
  }

  it("requires auth", async () => {
    const id = listings[0]!.id;
    for (const [method, url] of [
      ["GET", "/lookbook"],
      ["PUT", `/lookbook/${id}`],
      ["DELETE", `/lookbook/${id}`],
    ] as const) {
      const res = await app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("saves listings and lists them newest first as feed cards", async () => {
    const headers = await login(app);
    const seller = await repos.registerSeller((await repos.findUserByPhone("919876543210"))!.id, "Studio Nine");
    const { listing: sellerListing } = await repos.createSellerListing({
      sellerId: seller.id,
      title: "Linen shirt",
      category: "Tops",
      tags: [],
      coinPrice: 40,
      productImageKeys: [],
      houseModelRenderKey: "https://cdn.example.com/linen.jpg",
      affiliateUrl: null,
      variant: { size: "M", color: "White", garmentImageKey: "https://cdn.example.com/linen-g.jpg" },
    });

    for (const id of [listings[0]!.id, sellerListing.id, listings[1]!.id]) {
      const res = await app.inject({ method: "PUT", url: `/lookbook/${id}`, headers });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
    }

    const res = await app.inject({ method: "GET", url: "/lookbook", headers });
    expect(res.statusCode).toBe(200);
    const { items } = res.json() as { items: ListingCard[] };
    expect(items.map((item) => item.id)).toEqual([
      listings[1]!.id,
      sellerListing.id,
      listings[0]!.id,
    ]);
    for (const item of items) expect(ListingCardSchema.parse(item)).toEqual(item);
    expect(items[1]).toMatchObject({ sellerId: seller.id, sellerName: "Studio Nine" });

    // Same cards the feed shows for these listings.
    const feed = await app.inject({ method: "GET", url: "/feed?limit=50" });
    const feedCards = new Map(
      (feed.json() as { items: ListingCard[] }).items.map((card) => [card.id, card]),
    );
    for (const item of items) expect(item).toEqual(feedCards.get(item.id));
  });

  it("treats a repeat save as a no-op that keeps the original position", async () => {
    const headers = await login(app);
    const [first, second] = listings;

    await app.inject({ method: "PUT", url: `/lookbook/${first!.id}`, headers });
    await app.inject({ method: "PUT", url: `/lookbook/${second!.id}`, headers });
    const repeat = await app.inject({ method: "PUT", url: `/lookbook/${first!.id}`, headers });

    expect(repeat.statusCode).toBe(204);
    expect(await lookbookIds(headers)).toEqual([second!.id, first!.id]);
  });

  it("rejects listings that don't exist or aren't live", async () => {
    const headers = await login(app);

    const unknown = await app.inject({ method: "PUT", url: `/lookbook/${randomUUID()}`, headers });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "Not Found", message: "Listing not found" });

    await setStatus(listings[0]!, "ARCHIVED");
    const archived = await app.inject({ method: "PUT", url: `/lookbook/${listings[0]!.id}`, headers });
    expect(archived.statusCode).toBe(404);

    const malformed = await app.inject({ method: "PUT", url: "/lookbook/not-a-uuid", headers });
    expect(malformed.statusCode).toBe(400);

    expect(await lookbookIds(headers)).toEqual([]);
  });

  it("removes saved listings, idempotently", async () => {
    const headers = await login(app);
    const [first, second] = listings;
    await app.inject({ method: "PUT", url: `/lookbook/${first!.id}`, headers });
    await app.inject({ method: "PUT", url: `/lookbook/${second!.id}`, headers });

    for (const id of [first!.id, first!.id, randomUUID()]) {
      const res = await app.inject({ method: "DELETE", url: `/lookbook/${id}`, headers });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
    }

    expect(await lookbookIds(headers)).toEqual([second!.id]);
  });

  it("leaves out saved listings that are no longer live, and keeps the save", async () => {
    const headers = await login(app);
    const [first, second] = listings;
    await app.inject({ method: "PUT", url: `/lookbook/${first!.id}`, headers });
    await app.inject({ method: "PUT", url: `/lookbook/${second!.id}`, headers });

    await setStatus(first!, "ARCHIVED");
    expect(await lookbookIds(headers)).toEqual([second!.id]);

    await setStatus(first!, "ACTIVE");
    expect(await lookbookIds(headers)).toEqual([second!.id, first!.id]);
  });

  it("keeps each user's lookbook separate", async () => {
    const alice = await login(app, "919000000001");
    const bob = await login(app, "919000000002");
    const id = listings[0]!.id;

    await app.inject({ method: "PUT", url: `/lookbook/${id}`, headers: alice });
    expect(await lookbookIds(bob)).toEqual([]);

    await app.inject({ method: "DELETE", url: `/lookbook/${id}`, headers: bob });
    expect(await lookbookIds(alice)).toEqual([id]);
  });
});
