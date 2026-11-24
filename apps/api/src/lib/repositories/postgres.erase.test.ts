import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// Account erasure (DELETE /vault) edge cases. The same cases run on memory (always) and Postgres
// (with DATABASE_URL), so the two can't drift apart again.
describe("memory account erasure", () => {
  const repos = createMemoryRepositories();
  eraseCases(() => repos);
});

describePostgres("Postgres account erasure", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  eraseCases(() => repos);
});

function eraseCases(getRepos: () => Repositories) {
  const phone = () => `9${randomInt(10 ** 10, 10 ** 11)}`;
  async function newUser() {
    const { user } = await getRepos().createUser(phone());
    await getRepos().grantCoins({ userId: user.id, delta: 500, type: "GRANT", refType: "test" });
    return user;
  }
  async function sellerWithListing(userId: string) {
    const repos = getRepos();
    const seller = await repos.registerSeller(userId, `Shop ${randomUUID().slice(0, 6)}`);
    const tag = randomUUID().slice(0, 8);
    const { listing, variant } = await repos.createSellerListing({
      sellerId: seller.id,
      title: "Linen shirt",
      category: "tops",
      tags: [],
      coinPrice: 40,
      productImageKeys: [`sellers/${tag}/product.jpg`],
      houseModelRenderKey: `sellers/${tag}/house.jpg`,
      affiliateUrl: null,
      variant: { size: "M", color: "white", garmentImageKey: `sellers/${tag}/garment.jpg` },
    });
    return { seller, listing, variant, tag };
  }

  it("erases a seller whose listing another user ordered and carted, and keeps that listing archived", async () => {
    const repos = getRepos();
    const sellerUser = await newUser();
    const buyer = await newUser();
    const { listing, variant, tag } = await sellerWithListing(sellerUser.id);
    const unsold = await sellerWithListingFor(repos, sellerUser.id);
    await repos.placeOrder({
      userId: buyer.id,
      tier: "STANDARD",
      coinTotal: 40,
      stateEta: {},
      items: [{ listingVariantId: variant.id, coinPriceSnapshot: 40, quantity: 1 }],
    });
    const cart = await repos.getOrCreateCart(buyer.id);
    await repos.addCartItem({ cartId: cart.id, listingVariantId: variant.id, coinPriceSnapshot: 40, quantity: 1 });

    const keys = await repos.listUserStorageKeys(sellerUser.id);
    // The sold listing's images stay with it; the unsold one's go.
    expect(keys).not.toContain(`sellers/${tag}/garment.jpg`);
    expect(keys).toEqual(expect.arrayContaining([`sellers/${unsold.tag}/garment.jpg`, `sellers/${unsold.tag}/product.jpg`]));

    await repos.deleteAllUserData(sellerUser.id);

    expect(await repos.findUserById(sellerUser.id)).toBeNull();
    expect(await repos.findSellerByUserId(sellerUser.id)).toBeNull();
    expect(await repos.findListingById(listing.id)).toMatchObject({ status: "ARCHIVED", sellerId: null });
    expect(await repos.findVariantById(variant.id)).not.toBeNull();
    expect(await repos.findListingById(unsold.listing.id)).toBeNull();
    expect(await repos.listOrdersByUserId(buyer.id)).toHaveLength(1);
    expect(await repos.getCartItems(cart.id)).toHaveLength(1);
  });

  it("erases a seller's own orders of their listing with the rest of their data", async () => {
    const repos = getRepos();
    const sellerUser = await newUser();
    const { listing, variant } = await sellerWithListing(sellerUser.id);
    await repos.placeOrder({
      userId: sellerUser.id,
      tier: "STANDARD",
      coinTotal: 40,
      stateEta: {},
      items: [{ listingVariantId: variant.id, coinPriceSnapshot: 40, quantity: 1 }],
    });
    await repos.deleteAllUserData(sellerUser.id);
    expect(await repos.findListingById(listing.id)).toBeNull();
  });

  it("clears other users' referred_by, so their first order has no missing referrer", async () => {
    const repos = getRepos();
    const referrer = await newUser();
    const referred = await newUser();
    expect(await repos.applyReferralCode(referred.id, referrer.referralCode!)).not.toBeNull();
    expect((await repos.findUserById(referred.id))?.referredBy).toBe(referrer.id);

    await repos.deleteAllUserData(referrer.id);

    expect((await repos.findUserById(referred.id))?.referredBy).toBeNull();
  });

  it("deletes the sign-in codes sent to the user's phone", async () => {
    const repos = getRepos();
    const number = phone();
    const { user } = await repos.createUser(number);
    await repos.saveOtp(number, "hashed-code", new Date(Date.now() + 5 * 60_000));
    await repos.deleteAllUserData(user.id);
    // A code left behind would still sign the number in.
    expect(await repos.consumeOtp(number, "hashed-code")).toBe(false);
  });

  it("collects the user's Closet fit preview images", async () => {
    const repos = getRepos();
    const user = await newUser();
    await repos.seedCustomizationTemplates();
    const [template] = await repos.listCustomizationTemplates();
    const { preview } = await repos.claimFitPreview({
      userId: user.id,
      templateId: template!.id,
      selectionsKey: randomUUID(),
      garmentKey: "garment",
      provider: "mock",
      staleBefore: new Date(Date.now() - 60_000),
    });
    const imageKey = `users/${user.id}/fit-preview/${preview.id}.jpg`;
    await repos.finishFitPreview(preview.id, user.id, { status: "READY", imageKey, provider: "mock", costMicros: 0 });
    expect(await repos.listUserStorageKeys(user.id)).toContain(imageKey);
  });
}

async function sellerWithListingFor(repos: Repositories, userId: string) {
  const seller = (await repos.findSellerByUserId(userId))!;
  const tag = randomUUID().slice(0, 8);
  const { listing } = await repos.createSellerListing({
    sellerId: seller.id,
    title: "Unsold scarf",
    category: "accessories",
    tags: [],
    coinPrice: 20,
    productImageKeys: [`sellers/${tag}/product.jpg`],
    houseModelRenderKey: `sellers/${tag}/house.jpg`,
    affiliateUrl: null,
    variant: { size: "OS", color: "red", garmentImageKey: `sellers/${tag}/garment.jpg` },
  });
  return { listing, tag };
}
