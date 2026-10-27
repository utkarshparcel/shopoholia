import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { createMockStorage, type StorageClient } from "../lib/storage/r2.js";
import { login } from "../test-utils.js";

function createTrackingStorage(): StorageClient & { deletedKeys: string[] } {
  const inner = createMockStorage();
  const deletedKeys: string[] = [];
  return {
    deletedKeys,
    put: (o) => inner.put(o),
    getSignedUrl: (k, e) => inner.getSignedUrl(k, e),
    async delete(key) {
      deletedKeys.push(key);
      await inner.delete(key);
    },
    async deleteMany(keys) {
      deletedKeys.push(...keys);
      await inner.deleteMany(keys);
    },
  };
}

describe("vault", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let repos: ReturnType<typeof createMemoryRepositories>;
  let storage: ReturnType<typeof createTrackingStorage>;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    repos = createMemoryRepositories();
    storage = createTrackingStorage();
    app = await buildServer({ logger: false, deps: { repos, storage } });
    const session = await login(app);
    token = session.accessToken;
    userId = session.userId;
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects unauthenticated consent grant with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/vault/consent",
      payload: { userId, scope: "EMAIL", source: "test" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("grants, exports, and revokes a consent", async () => {
    const grant = await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "EMAIL", source: "test" },
    });
    expect(grant.statusCode).toBe(201);
    expect(grant.json().scope).toBe("EMAIL");

    const exp = await app.inject({
      method: "GET",
      url: "/vault/export",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(exp.statusCode).toBe(200);
    expect(exp.json().grants).toHaveLength(1);

    const revoke = await app.inject({
      method: "DELETE",
      url: "/vault/consent/EMAIL",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revoke.statusCode).toBe(204);

    const exp2 = await app.inject({
      method: "GET",
      url: "/vault/export",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(exp2.json().grants).toHaveLength(0);
  });

  it("returns 409 on duplicate active consent", async () => {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "EMAIL", source: "test" },
    });
    const dup = await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "EMAIL", source: "test" },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("hard-deletes the user vault", async () => {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "EMAIL", source: "test" },
    });
    const del = await app.inject({
      method: "DELETE",
      url: "/vault",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);

    const exp = await app.inject({
      method: "GET",
      url: "/vault/export",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(exp.json().grants).toHaveLength(0);
    expect(await repos.findUserById(userId)).toBeNull();
  });

  it("hard-delete purges refresh tokens and removes storage keys", async () => {
    const refreshToken = "rt-vault-delete-test";
    await repos.saveRefreshToken({
      token: refreshToken,
      userId,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect(await repos.findRefreshToken(refreshToken)).not.toBeNull();

    await repos.createReceipt({
      userId,
      imageKey: "receipts/user/delete-me.jpg",
      merchant: "Mock",
      purchasedAt: new Date(),
      totalMinor: 100,
      ocrJson: {},
    });
    await repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "ingestion/raw/delete-me",
      parsedJson: {},
    });
    await repos.upsertAvatar({
      userId,
      referenceImageKey: "avatars/ref.jpg",
      sourceUploadKeys: ["avatars/src1.jpg"],
      bodyMeta: {},
      status: "READY",
    });
    await storage.put({
      key: "receipts/user/delete-me.jpg",
      body: Buffer.from("r"),
      contentType: "image/jpeg",
    });
    await storage.put({
      key: "ingestion/raw/delete-me",
      body: Buffer.from("d"),
      contentType: "application/octet-stream",
    });
    await storage.put({
      key: "avatars/ref.jpg",
      body: Buffer.from("a"),
      contentType: "image/jpeg",
    });
    await storage.put({
      key: "avatars/src1.jpg",
      body: Buffer.from("s"),
      contentType: "image/jpeg",
    });

    const del = await app.inject({
      method: "DELETE",
      url: "/vault",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);
    expect(await repos.findUserById(userId)).toBeNull();
    expect(await repos.findRefreshToken(refreshToken)).toBeNull();
    expect(storage.deletedKeys).toEqual(
      expect.arrayContaining([
        "receipts/user/delete-me.jpg",
        "ingestion/raw/delete-me",
        "avatars/ref.jpg",
        "avatars/src1.jpg",
      ]),
    );
  });

  it("export contains the user's money, receipts, warranties and merchant purchases", async () => {
    await repos.grantConsent({ userId, scope: "FINANCIAL", source: "test" });
    const account = await repos.createMoneyAccount({
      userId,
      kind: "GIFT_CARD",
      merchant: "Amazon",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: account.id,
      userId,
      delta: 1000,
      type: "DEPOSIT",
      refType: "credit.add",
      refId: account.id,
    });
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/x/y.jpg",
      merchant: "Mock Mart",
      purchasedAt: new Date(),
      totalMinor: 129900,
      ocrJson: {},
    });
    const { purchase } = await repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Mock Mart",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 129900,
      items: [{ title: "Cotton T-Shirt", priceMinor: 129900 }],
    });
    await repos.updateReceiptPurchaseId(receipt.id, userId, purchase.id);
    await repos.createWarranty({
      userId,
      receiptId: receipt.id,
      itemTitle: "Cotton T-Shirt",
      provider: "Mock Mart",
      coverageUntil: new Date(Date.now() + 86_400_000),
      claimContact: null,
    });

    const exp = await app.inject({
      method: "GET",
      url: "/vault/export",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(exp.statusCode).toBe(200);
    const body = exp.json();
    expect(body.grants).toHaveLength(1);
    expect(body.moneyAccounts).toHaveLength(1);
    expect(body.moneyLedger).toHaveLength(1);
    expect(body.receipts).toHaveLength(1);
    expect(body.warranties).toHaveLength(1);
    expect(body.merchantPurchases).toHaveLength(1);
    // Tokens are redacted in the export.
    expect(body.ingestionSources).toEqual([]);
  });

  it("hard delete cascades receipts, warranties and merchant purchases", async () => {
    await repos.grantConsent({ userId, scope: "FINANCIAL", source: "test" });
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/x/y.jpg",
      merchant: "Mock Mart",
      purchasedAt: new Date(),
      totalMinor: 129900,
      ocrJson: {},
    });
    const { purchase } = await repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Mock Mart",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 129900,
      items: [{ title: "Cotton T-Shirt", priceMinor: 129900 }],
    });
    await repos.updateReceiptPurchaseId(receipt.id, userId, purchase.id);
    await repos.createWarranty({
      userId,
      receiptId: receipt.id,
      itemTitle: "Cotton T-Shirt",
      provider: "Mock Mart",
      coverageUntil: new Date(Date.now() + 86_400_000),
      claimContact: null,
    });

    const del = await app.inject({
      method: "DELETE",
      url: "/vault",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);
    expect(await repos.findUserById(userId)).toBeNull();
    expect(await repos.listReceipts(userId)).toHaveLength(0);
    expect(await repos.listWarranties(userId)).toHaveLength(0);
    expect(await repos.listMerchantPurchasesByUser(userId)).toHaveLength(0);
  });

  it("export returns full graph and hard-delete leaves zero rows for every user table", async () => {
    // --- consent & money ---
    await repos.grantConsent({ userId, scope: "FINANCIAL", source: "test" });
    await repos.grantConsent({ userId, scope: "EMAIL", source: "test" });
    const grant = await repos.findActiveConsent(userId, "EMAIL");
    await repos.createIngestionSource({ userId, kind: "EMAIL", provider: "gmail", consentGrantId: grant!.id });
    await repos.createIngestionDocument({ userId, kind: "EMAIL", rawKey: "raw/test1", parsedJson: { total: 100 } });
    const account = await repos.createMoneyAccount({
      userId,
      kind: "GIFT_CARD",
      merchant: "Amazon",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({ accountId: account.id, userId, delta: 500, type: "DEPOSIT", refType: "test", refId: account.id });
    const receipt = await repos.createReceipt({ userId, imageKey: "receipts/x.jpg", merchant: "Mock", purchasedAt: new Date(), totalMinor: 50000, ocrJson: {} });
    const { purchase } = await repos.createMerchantPurchase({ userId, source: "RECEIPT", merchant: "Mock", purchasedAt: new Date(), currency: "INR", totalMinor: 50000, items: [{ title: "T-Shirt", priceMinor: 50000 }] });
    await repos.updateReceiptPurchaseId(receipt.id, userId, purchase.id);
    await repos.createWarranty({ userId, receiptId: receipt.id, itemTitle: "T-Shirt", provider: "Mock", coverageUntil: new Date(Date.now() + 86400000), claimContact: null });

    // --- catalog & commerce ---
    const seller = await repos.registerSeller(userId, "Test Shop");
    const { listing, variant } = await repos.createSellerListing({ sellerId: seller.id, title: "Test Listing", category: "APPAREL", tags: ["test"], coinPrice: 100, productImageKeys: ["a.jpg"], houseModelRenderKey: "h.jpg", affiliateUrl: null, variant: { size: "M", color: "Red", garmentImageKey: "g.jpg" } });
    const cart = await repos.getOrCreateCart(userId);
    await repos.addCartItem({ cartId: cart.id, listingVariantId: variant.id, coinPriceSnapshot: 100, quantity: 1 });
    await repos.grantCoins({ userId, delta: 1000, type: "GRANT", refType: "test", refId: "grant" });
    const { order } = await repos.createOrder({ userId, tier: "STANDARD", coinTotal: 100, stateEta: {}, idempotencyKey: `idem-${userId}`, items: [{ listingVariantId: variant.id, coinPriceSnapshot: 100, quantity: 1 }] });
    const orderItemsList = await repos.listOrderItemsByOrderId(order.id);
    await repos.createRenders([{ orderItemId: orderItemsList[0]!.id, scenario: "STUDIO", imageKey: null, isFree: true, unlocked: false, provider: "test", status: "QUEUED", costMicros: 0 }]);

    // --- personalisation ---
    await repos.upsertAvatar({ userId, referenceImageKey: "ref.jpg", sourceUploadKeys: [], bodyMeta: {}, status: "READY" });
    await repos.upsertTryonPreview({ userId, listingVariantId: variant.id, imageKey: "tryon.jpg", status: "READY", provider: "test", costMicros: 0 });
    await repos.recordPushEvent({ userId, orderId: order.id, eventType: "test", dedupeKey: `dedupe-${userId}`, title: "Hi", body: "Body", payload: { deepLink: "worn://order", screen: "order", orderId: order.id }, status: "QUEUED" });
    await repos.recordCashbackEvent({ userId, listingId: listing.id, platform: "amazon", clickId: `click-${userId}` });
    await repos.recordIapReceipt({ eventId: `iap-${userId}`, userId, productId: "coins_100", coinsGranted: 100, rawPayload: {} });

    // --- wardrobe / waste / accountant ---
    await repos.createBudget({ userId, category: "APPAREL", period: "MONTHLY", limitMinor: 10000 });
    await repos.upsertSpendRollup({ userId, period: "2026-08", category: "APPAREL", totalMinor: 5000 });
    await repos.createReturnRequest({ userId, purchaseId: purchase.id, windowDeadline: new Date(Date.now() + 86400000) });
    const recipient = await repos.createRecipient({ userId, name: "Mom", relationship: "FAMILY", region: "IN" });
    await repos.createGiftOrder({ userId, recipientId: recipient.id, listingId: listing.id, occasion: "BIRTHDAY" });
    const measurement = await repos.createMeasurementProfile({ userId, region: "IN", unit: "CM", points: { chest: 90 } });
    const templates = await repos.listCustomizationTemplates();
    const templateId = templates[0]!.id;
    await repos.createTailoringOrder({ userId, templateId, measurementProfileId: measurement.id, selections: { neckline: "Round" } });
    const wardrobeItem = await repos.createWardrobeItem({ userId, category: "TOP", colors: ["Red"], brand: "Test", costMinor: 2000, imageKeys: ["img.jpg"] });
    const outfit = await repos.createOutfit({ userId, itemIds: [wardrobeItem.id], occasion: "CASUAL" });
    await repos.createWearLog({ userId, wardrobeItemId: wardrobeItem.id, outfitId: outfit.id });
    await repos.createDispositionListing({ userId, wardrobeItemId: wardrobeItem.id, mode: "SELL", priceMinor: 1000 });

    // --- export should contain everything ---
    const exp = await app.inject({ method: "GET", url: "/vault/export", headers: { authorization: `Bearer ${token}` } });
    expect(exp.statusCode).toBe(200);
    const body = exp.json() as unknown as Record<string, unknown[]>;
    // Verify critical fields are non-empty and redaction holds
    expect(body.grants.length).toBeGreaterThan(0);
    expect(body.moneyAccounts.length).toBe(1);
    expect(body.moneyLedger.length).toBe(1);
    expect(body.receipts.length).toBe(1);
    expect(body.warranties.length).toBe(1);
    expect(body.ingestionSources.length).toBe(1);
    expect(body.ingestionSources[0].encryptedToken).toBeNull();
    expect(body.merchantPurchases.length).toBe(1);
    expect(body.merchantPurchaseItems.length).toBe(1);
    expect((body.moneyLedger[0] as { accountId?: string }).accountId).toBe(
      account.id,
    );
    expect(body.ingestionDocuments.length).toBe(1);
    expect(body.orders.length).toBe(1);
    expect(body.orderItems.length).toBe(1);
    expect(body.carts.length).toBe(1);
    expect(body.cartItems.length).toBe(1);
    expect(body.sellers.length).toBe(1);
    expect(body.listings.length).toBe(1);
    expect(body.listingVariants.length).toBe(1);
    expect(body.avatars.length).toBe(1);
    expect(body.renders.length).toBe(1);
    expect(body.tryonPreviews.length).toBe(1);
    expect(body.pushEvents.length).toBe(1);
    expect(body.coinLedger.length).toBeGreaterThan(0);
    expect(body.iapReceipts.length).toBe(1);
    expect(body.cashbackEvents.length).toBe(1);
    expect(body.budgets.length).toBe(1);
    expect(body.spendRollups.length).toBe(1);
    expect(body.returnRequests.length).toBe(1);
    expect(body.returnEvents.length).toBe(1);
    expect(body.recipients.length).toBe(1);
    expect(body.recipientProfiles.length).toBe(1);
    expect(body.giftOrders.length).toBe(1);
    expect(body.measurementProfiles.length).toBe(1);
    expect(body.customizationTemplates.length).toBeGreaterThan(0);
    expect(body.tailoringOrders.length).toBe(1);
    expect(body.wardrobeItems.length).toBe(1);
    expect(body.outfits.length).toBe(1);
    expect(body.wearLog.length).toBe(1);
    expect(body.itemMetrics.length).toBe(1);
    expect(body.dispositionListings.length).toBe(1);

    // --- hard delete and verify zero rows ---
    const del = await app.inject({ method: "DELETE", url: "/vault", headers: { authorization: `Bearer ${token}` } });
    expect(del.statusCode).toBe(204);
    expect(await repos.findUserById(userId)).toBeNull();
    expect(await repos.listActiveConsents(userId)).toHaveLength(0);
    expect(await repos.listMoneyAccounts(userId)).toHaveLength(0);
    expect(await repos.listMoneyLedgerByUser(userId)).toHaveLength(0);
    expect(await repos.listReceipts(userId)).toHaveLength(0);
    expect(await repos.listWarranties(userId)).toHaveLength(0);
    expect(await repos.listIngestionSources(userId)).toHaveLength(0);
    expect(await repos.listMerchantPurchasesByUser(userId)).toHaveLength(0);
    expect(await repos.listMerchantPurchaseItems(purchase.id)).toHaveLength(0);
    expect(await repos.listIngestionDocumentsByUser(userId)).toHaveLength(0);
    expect(await repos.listOrdersByUserId(userId)).toHaveLength(0);
    expect(await repos.listOrderItemsByUser(userId)).toHaveLength(0);
    expect(await repos.listCartsByUser(userId)).toHaveLength(0);
    expect(await repos.listCartItemsByUser(userId)).toHaveLength(0);
    expect(await repos.listSellersByUser(userId)).toHaveLength(0);
    expect(await repos.listListingsByUser(userId)).toHaveLength(0);
    expect(await repos.listListingVariantsByUser(userId)).toHaveLength(0);
    expect(await repos.listAvatarsByUser(userId)).toHaveLength(0);
    expect(await repos.listRendersByUser(userId)).toHaveLength(0);
    expect(await repos.listTryonPreviewsByUser(userId)).toHaveLength(0);
    expect(await repos.listPushEvents(userId)).toHaveLength(0);
    expect(await repos.listCoinLedgerByUser(userId)).toHaveLength(0);
    expect(await repos.listIapReceiptsByUser(userId)).toHaveLength(0);
    expect(await repos.listCashbackEvents(userId)).toHaveLength(0);
    expect(await repos.listBudgets(userId)).toHaveLength(0);
    expect(await repos.getSpendRollups(userId)).toHaveLength(0);
    expect(await repos.listReturnRequests(userId)).toHaveLength(0);
    expect(await repos.listReturnEventsByUser(userId)).toHaveLength(0);
    expect(await repos.listRecipients(userId)).toHaveLength(0);
    expect(await repos.listRecipientProfilesByUser(userId)).toHaveLength(0);
    expect(await repos.listGiftOrders(userId)).toHaveLength(0);
    expect(await repos.listMeasurementProfiles(userId)).toHaveLength(0);
    expect(await repos.listTailoringOrders(userId)).toHaveLength(0);
    expect(await repos.listWardrobeItems(userId)).toHaveLength(0);
    expect(await repos.listOutfits(userId)).toHaveLength(0);
    expect(await repos.listWearLogs(userId)).toHaveLength(0);
    expect(await repos.getItemMetrics(userId)).toHaveLength(0);
    expect(await repos.listDispositionListings(userId)).toHaveLength(0);
  });

  it("GET/PUT notification-preferences via consentFlags.notifications", async () => {
    type NotifPrefs = {
      quietHoursStart: string;
      quietHoursEnd: string;
      categories: Record<string, boolean>;
    };
    const get1 = await app.inject({
      method: "GET",
      url: "/vault/notification-preferences",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(get1.statusCode).toBe(200);
    const defaults = get1.json() as NotifPrefs;
    expect(defaults.quietHoursStart).toBe("22:00");
    expect(defaults.categories.returns).toBe(true);

    const put = await app.inject({
      method: "PUT",
      url: "/vault/notification-preferences",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        quietHoursStart: "23:30",
        categories: { returns: false, outfits: false },
      },
    });
    expect(put.statusCode).toBe(200);
    const updated = put.json() as NotifPrefs;
    expect(updated.quietHoursStart).toBe("23:30");
    expect(updated.quietHoursEnd).toBe("07:00");
    expect(updated.categories.returns).toBe(false);
    expect(updated.categories.warranty).toBe(true);
    expect(updated.categories.outfits).toBe(false);

    const user = await repos.findUserById(userId);
    const flags = user?.consentFlags as
      | { notifications?: { quietHoursStart?: string } }
      | null
      | undefined;
    expect(flags?.notifications?.quietHoursStart).toBe("23:30");

    const get2 = await app.inject({
      method: "GET",
      url: "/vault/notification-preferences",
      headers: { authorization: `Bearer ${token}` },
    });
    expect((get2.json() as NotifPrefs).quietHoursStart).toBe("23:30");
  });

  it("GET /audit returns self records and blanks other users", async () => {
    const { listAuditRecords } = await import("../lib/audit.js");

    const grant = await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "audit-test" },
    });
    expect(grant.statusCode).toBe(201);
    expect(
      listAuditRecords({ userId, event: "consent.granted" }).some(
        (r) => r.event === "consent.granted",
      ),
    ).toBe(true);

    const self = await app.inject({
      method: "GET",
      url: "/vault/audit?event=consent.granted&limit=10",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(self.statusCode).toBe(200);
    const selfBody = self.json() as { records: Array<{ event: string; userId?: string }> };
    expect(selfBody.records.some((r) => r.event === "consent.granted")).toBe(true);

    const other = await app.inject({
      method: "GET",
      url: `/audit?userId=00000000-0000-4000-8000-000000000099`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(other.statusCode).toBe(200);
    expect((other.json() as { records: unknown[] }).records).toEqual([]);
  });
});
