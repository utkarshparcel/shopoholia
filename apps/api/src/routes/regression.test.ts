import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";

describe("regression Track 0 P0", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  let repos: Awaited<ReturnType<typeof buildTestServer>>["repos"];
  let token: string;
  let userId: string;

  beforeEach(async () => {
    const s = await buildTestServer();
    app = s.app;
    repos = s.repos;
    const session = await login(app);
    token = session.accessToken;
    userId = session.userId;
  });

  afterEach(async () => {
    await app.close();
  });

  it("un-consented financial reads return 403", async () => {
    // No FINANCIAL consent yet
    const routes: Array<{ method: "GET" | "POST"; url: string }> = [
      { method: "GET", url: "/credits" },
      { method: "GET", url: "/accountant/summary" },
      { method: "GET", url: "/accountant/ledger" },
      { method: "GET", url: "/budgets" },
    ];
    for (const r of routes) {
      const res = await app.inject({
        method: r.method,
        url: r.url,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    }

    // POST /budgets and POST /credits also require consent
    const postBudget = await app.inject({
      method: "POST",
      url: "/budgets",
      headers: { authorization: `Bearer ${token}` },
      payload: { category: "GENERAL", period: "MONTHLY", limitMinor: 1000 },
    });
    expect(postBudget.statusCode).toBe(403);

    const postCredit = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "GIFT_CARD", merchant: "Test", currency: "INR", balanceMinor: 100 },
    });
    expect(postCredit.statusCode).toBe(403);

    // After granting, reads succeed
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "test" },
    });
    const ok = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("credit add race: concurrent creates with same idempotencyKey yield one account", async () => {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "test" },
    });
    const key = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const payload = {
      kind: "GIFT_CARD" as const,
      merchant: "Nykaa",
      currency: "INR",
      balanceMinor: 7500,
      idempotencyKey: key,
    };
    const [a, b] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload,
      }),
      app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload,
      }),
    ]);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    const idA = (a.json() as { id: string }).id;
    const idB = (b.json() as { id: string }).id;
    expect(idA).toBe(idB);
    expect((a.json() as { balanceCacheMinor: number }).balanceCacheMinor).toBe(7500);
    expect((b.json() as { balanceCacheMinor: number }).balanceCacheMinor).toBe(7500);

    const list = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    const accounts = (list.json() as { accounts: Array<{ id: string; balanceCacheMinor: number }> })
      .accounts;
    // Only the deposited account should remain — race losers' orphan shells are deleted.
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.id).toBe(idA);
    expect(accounts[0]!.balanceCacheMinor).toBe(7500);

    const repoAccounts = await repos.listMoneyAccounts(userId);
    expect(repoAccounts).toHaveLength(1);
    expect(await repos.purgeOrphanMoneyAccounts(userId)).toBe(0);

    const tx = await app.inject({
      method: "GET",
      url: `/credits/${idA}/transactions`,
      headers: { authorization: `Bearer ${token}` },
    });
    const deposits = (
      tx.json() as { transactions: Array<{ type: string; refId: string | null }> }
    ).transactions.filter((t) => t.type === "DEPOSIT" && t.refId === key);
    expect(deposits).toHaveLength(1);
  });

  it("credit double-spend race: concurrent spends with same idempotencyKey are idempotent", async () => {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "test" },
    });
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "STORE_CREDIT", merchant: "Myntra", currency: "INR", balanceMinor: 1000 },
    });
    expect(add.statusCode).toBe(201);
    const accountId = (add.json() as { id: string }).id;

    const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const [r1, r2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountMinor: 400, idempotencyKey: key },
      }),
      app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountMinor: 400, idempotencyKey: key },
      }),
    ]);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect((r1.json() as { balanceMinor: number }).balanceMinor).toBe(600);
    expect((r2.json() as { balanceMinor: number }).balanceMinor).toBe(600);

    const tx = await app.inject({
      method: "GET",
      url: `/credits/${accountId}/transactions`,
      headers: { authorization: `Bearer ${token}` },
    });
    const ledger = (tx.json() as { transactions: Array<{ type: string; refId: string | null }> }).transactions;
    const spends = ledger.filter((l) => l.type === "SPEND" && l.refId === key);
    expect(spends).toHaveLength(1);
  });

  it("credit add double POST with same idempotencyKey yields one account", async () => {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "test" },
    });

    const idempotencyKey = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const payload = {
      kind: "GIFT_CARD" as const,
      merchant: "Amazon",
      currency: "INR",
      balanceMinor: 3000,
      idempotencyKey,
    };

    const first = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const accountId = (first.json() as { id: string }).id;

    const second = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(second.statusCode).toBe(201);
    expect((second.json() as { id: string }).id).toBe(accountId);

    const list = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect((list.json() as { accounts: unknown[] }).accounts).toHaveLength(1);
  });

  it("credit double-spend race: concurrent overspends are serialized and second is rejected", async () => {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "test" },
    });
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "CASH", merchant: "Worn", currency: "INR", balanceMinor: 1000 },
    });
    const accountId = (add.json() as { id: string }).id;

    // Two concurrent spends that together would overdraw (800 + 800 > 1000).
    // With proper row-locking / withMoneyLock only one should succeed.
    const k1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const k2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const [a, b] = await Promise.allSettled([
      app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountMinor: 800, idempotencyKey: k1 },
      }),
      app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountMinor: 800, idempotencyKey: k2 },
      }),
    ]);

    const responses = [a, b].map((r) => {
      if (r.status === "fulfilled") return r.value;
      throw r.reason;
    });
    const statuses = responses.map((r) => r.statusCode);
    // One should be 200, the other should be 400/500 due to insufficient balance
    expect(statuses).toEqual(expect.arrayContaining([200]));
    expect(statuses.filter((s) => s !== 200).length).toBe(1);
    const failed = responses.find((r) => r.statusCode !== 200);
    expect(failed).toBeDefined();
  });

  it("hard-delete leaves zero user rows across all tables", async () => {
    // Create data across representative tables
    await repos.grantConsent({ userId, scope: "FINANCIAL", source: "test" });
    await repos.grantConsent({ userId, scope: "EMAIL", source: "test" });
    const acct = await repos.createMoneyAccount({
      userId,
      kind: "GIFT_CARD",
      merchant: "Amazon",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({ accountId: acct.id, userId, delta: 500, type: "DEPOSIT", refType: "test", refId: acct.id });
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/x.jpg",
      merchant: "Myntra",
      purchasedAt: new Date(),
      totalMinor: 1000,
      ocrJson: {},
    });
    const { purchase, items: purchaseItems } = await repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 1000,
      items: [{ title: "Shirt", priceMinor: 1000, category: "APPAREL" }],
    });
    expect(purchaseItems.length).toBe(1);
    const purchaseId = purchase.id;
    await repos.updateReceiptPurchaseId(receipt.id, userId, purchaseId);
    await repos.createWarranty({
      userId,
      receiptId: receipt.id,
      itemTitle: "Shirt",
      provider: "Myntra",
      coverageUntil: new Date(Date.now() + 86_400_000),
      claimContact: null,
    });
    await repos.createWardrobeItem({ userId, category: "TOP", costMinor: 1000 });
    await repos.createBudget({ userId, category: "GENERAL", period: "MONTHLY", limitMinor: 5000 });
    await repos.createRecipient({ userId, name: "Mom" });

    // Create a second user to ensure isolation
    const other = await repos.createUser("919999999999");
    const otherId = other.user.id;
    await repos.createMoneyAccount({
      userId: otherId,
      kind: "CASH",
      merchant: "Other",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });

    const del = await app.inject({
      method: "DELETE",
      url: "/vault",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(204);
    expect(await repos.findUserById(userId)).toBeNull();

    // Assert zero rows for deleted user across all user-scoped tables
    expect(await repos.listMoneyAccounts(userId)).toHaveLength(0);
    expect(await repos.listMoneyLedgerByUser(userId)).toHaveLength(0);
    expect(await repos.listReceipts(userId)).toHaveLength(0);
    expect(await repos.listWarranties(userId)).toHaveLength(0);
    expect(await repos.listMerchantPurchasesByUser(userId)).toHaveLength(0);
    // merchant_purchase_items must cascade with purchases (FK-safe delete)
    expect(await repos.listMerchantPurchaseItems(purchaseId)).toHaveLength(0);
    expect(
      (await repos.listMerchantPurchaseItemsByPurchaseIds([purchaseId])).get(purchaseId) ?? [],
    ).toHaveLength(0);
    expect(await repos.listBudgets(userId)).toHaveLength(0);
    expect(await repos.listWardrobeItems(userId)).toHaveLength(0);
    expect(await repos.listRecipients(userId)).toHaveLength(0);
    expect(await repos.listActiveConsents(userId)).toHaveLength(0);
    const coinBal = await repos.getCoinBalance(userId).catch(() => 0);
    expect(coinBal).toBe(0);

    // Other user still intact
    expect(await repos.listMoneyAccounts(otherId)).toHaveLength(1);
    expect(await repos.findUserById(otherId)).not.toBeNull();
  });

  it("export round-trips and contains all tables", async () => {
    await repos.grantConsent({ userId, scope: "FINANCIAL", source: "test" });
    const acct = await repos.createMoneyAccount({
      userId,
      kind: "GIFT_CARD",
      merchant: "Amazon",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({ accountId: acct.id, userId, delta: 1234, type: "DEPOSIT", refType: "test", refId: acct.id });
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/y.jpg",
      merchant: "TestMart",
      purchasedAt: new Date(),
      totalMinor: 2000,
      ocrJson: { foo: "bar" },
    });
    const { purchase } = await repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "TestMart",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 2000,
      items: [{ title: "Jeans", priceMinor: 2000, category: "APPAREL" }],
    });
    await repos.updateReceiptPurchaseId(receipt.id, userId, purchase.id);
    await repos.createWarranty({
      userId,
      receiptId: receipt.id,
      itemTitle: "Jeans",
      provider: "TestMart",
      coverageUntil: new Date(Date.now() + 86_400_000),
      claimContact: null,
    });
    await repos.createWardrobeItem({ userId, category: "BOTTOM", costMinor: 2000 });
    const budget = await repos.createBudget({ userId, category: "APPAREL", period: "MONTHLY", limitMinor: 10000 });

    const res = await app.inject({
      method: "GET",
      url: "/vault/export",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown[]>;

    // Export must contain all expected top-level keys
    const expectedKeys = [
      "grants",
      "moneyAccounts",
      "moneyLedger",
      "receipts",
      "warranties",
      "merchantPurchases",
      "merchantPurchaseItems",
      "budgets",
      "wardrobeItems",
    ];
    for (const k of expectedKeys) {
      expect(body).toHaveProperty(k);
      expect(Array.isArray(body[k])).toBe(true);
    }
    expect((body["moneyAccounts"] as unknown[]).length).toBe(1);
    expect((body["moneyLedger"] as unknown[]).length).toBe(1);
    expect(
      (body["moneyLedger"] as Array<Record<string, unknown>>)[0]?.["accountId"],
    ).toBe(acct.id);
    expect((body["receipts"] as unknown[]).length).toBe(1);
    expect((body["warranties"] as unknown[]).length).toBe(1);
    expect((body["merchantPurchases"] as unknown[]).length).toBe(1);
    expect((body["merchantPurchaseItems"] as unknown[]).length).toBe(1);
    expect((body["budgets"] as unknown[]).length).toBe(1);
    expect((body["wardrobeItems"] as unknown[]).length).toBe(1);

    // Content round-trip: created IDs appear in export
    const moneyAccounts = body["moneyAccounts"] as Array<Record<string, unknown>>;
    expect(moneyAccounts.some((a) => a["id"] === acct.id)).toBe(true);
    const receipts = body["receipts"] as Array<Record<string, unknown>>;
    expect(receipts.some((r) => r["id"] === receipt.id)).toBe(true);
    const budgetsArr = body["budgets"] as Array<Record<string, unknown>>;
    expect(budgetsArr.some((b) => b["id"] === budget.id)).toBe(true);
  });
});
