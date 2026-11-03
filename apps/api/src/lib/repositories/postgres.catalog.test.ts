import { randomUUID } from "node:crypto";
import { createDb } from "@worn/db";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositories } from "./postgres.js";
import type { ListingRecord, ListingVariantRecord, Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

function fixture(title: string): { listing: ListingRecord; variant: ListingVariantRecord } {
  const id = randomUUID();
  return {
    listing: {
      id,
      sellerId: null,
      title,
      category: `clear-${id.slice(0, 8)}`,
      tags: [],
      coinPrice: 40,
      realPrice: "₹499",
      productImageKeys: [],
      houseModelRenderKey: "house-models/x.jpg",
      affiliateUrl: null,
      affiliateLinks: null,
      status: "ACTIVE",
      sortOrder: 2_000_000_100,
      createdAt: new Date(),
    },
    variant: { id: randomUUID(), listingId: id, size: "M", color: "Black", garmentImageKey: "garments/x.jpg" },
  };
}

/** One ordered listing and one that nobody ordered; then the catalog is cleared. */
async function clearWithOneOrder(repos: Repositories) {
  const ordered = fixture("Ordered Tee");
  const unordered = fixture("Unordered Tee");
  await repos.seedListings([ordered.listing, unordered.listing], [ordered.variant, unordered.variant]);
  const { user } = await repos.createUser(`+9199${Math.floor(Math.random() * 1e8)}`);
  const { order, items } = await repos.createOrder({
    userId: user.id,
    tier: "STANDARD",
    coinTotal: 40,
    stateEta: { PROCESSING: new Date().toISOString() },
    items: [{ listingVariantId: ordered.variant.id, coinPriceSnapshot: 40, quantity: 1 }],
  });
  await repos.createRenders([
    {
      id: randomUUID(),
      orderItemId: items[0]!.id,
      scenario: "STUDIO",
      imageKey: "reveal/studio/x.jpg",
      isFree: true,
      unlocked: true,
      provider: "mock-fashn",
      status: "DONE",
      costMicros: 0,
    },
  ]);
  const cart = await repos.getOrCreateCart(user.id);
  await repos.addCartItem({ cartId: cart.id, listingVariantId: unordered.variant.id, coinPriceSnapshot: 40, quantity: 1 });

  await repos.clearCatalog();

  return {
    orderItems: await repos.listOrderItemsByOrderId(order.id),
    renders: await repos.findRendersByOrderId(order.id),
    orderedListing: await repos.findListingById(ordered.listing.id),
    orderedVariant: await repos.findVariantById(ordered.variant.id),
    unorderedListing: await repos.findListingById(unordered.listing.id),
    cart: await repos.getCartItems(cart.id),
  };
}

function expectOrdersKept(result: Awaited<ReturnType<typeof clearWithOneOrder>>) {
  expect(result.orderItems).toHaveLength(1);
  expect(result.renders).toHaveLength(1);
  expect(result.orderedListing?.status).toBe("ARCHIVED");
  expect(result.orderedVariant).not.toBeNull();
  expect(result.unorderedListing).toBeNull();
  expect(result.cart).toHaveLength(0);
}

describe("clearCatalog (memory)", () => {
  it("keeps order lines and renders: ordered listings are archived, the rest deleted", async () => {
    expectOrdersKept(await clearWithOneOrder(createMemoryRepositories()));
  });
});

class Rollback extends Error {}

describePostgres("clearCatalog (postgres)", () => {
  it("never truncates order_items or renders", async () => {
    const db = createDb(databaseUrl!);
    let result: Awaited<ReturnType<typeof clearWithOneOrder>> | undefined;
    // Inside a transaction that is rolled back, so the shared catalog other suites use survives.
    await db
      .transaction(async (tx) => {
        result = await clearWithOneOrder(createPostgresRepositories(tx as unknown as typeof db));
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    expectOrdersKept(result!);
  });
});

/** Runs `body` against repositories bound to a transaction that is rolled back afterwards. */
async function inRollback<T>(body: (repos: Repositories) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl!);
  let result: T | undefined;
  await db
    .transaction(async (tx) => {
      result = await body(createPostgresRepositories(tx as unknown as typeof db));
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
  return result!;
}

const links = [{ url: "https://www.amazon.in/dp/B0TEST", label: "Amazon", platform: "amazon" as const }];

describe("listing partner price and links", () => {
  async function roundTrip(repos: Repositories) {
    const seeded = fixture("Linked Tee");
    await repos.seedListings([{ ...seeded.listing, affiliateLinks: links }], [seeded.variant]);
    const { user } = await repos.createUser(`+9198${Math.floor(Math.random() * 1e8)}`);
    const seller = await repos.registerSeller(user.id, "Hunt Shop");
    const created = await repos.createSellerListing({
      sellerId: seller.id,
      title: "Seller Tee",
      category: "tops",
      tags: [],
      coinPrice: 50,
      realPrice: "₹799",
      productImageKeys: [],
      houseModelRenderKey: "products/x.jpg",
      affiliateUrl: null,
      affiliateLinks: links,
      variant: { size: "M", color: "Blue", garmentImageKey: "products/x.jpg" },
    });
    return {
      seeded: await repos.findListingById(seeded.listing.id),
      created: await repos.findListingById(created.listing.id),
    };
  }

  function expectKept(result: Awaited<ReturnType<typeof roundTrip>>) {
    expect(result.seeded?.realPrice).toBe("₹499");
    expect(result.seeded?.affiliateLinks).toEqual(links);
    expect(result.created?.realPrice).toBe("₹799");
    expect(result.created?.affiliateLinks).toEqual(links);
  }

  it("memory keeps them", async () => {
    expectKept(await roundTrip(createMemoryRepositories()));
  });

  describePostgres("postgres", () => {
    it("keeps them", async () => {
      expectKept(await inRollback(roundTrip));
    });
  });
});
