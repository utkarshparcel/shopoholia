import { afterEach, describe, it, expect, vi } from "vitest";
import { buildTestServer, login } from "../test-utils.js";

describe("accountant", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates budgets and returns summary with spend by category", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    // Grant financial consent and create a receipt-backed purchase via receipts flow
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    // Create a receipt + confirm to seed merchant_purchase
    // Use internal repos to create purchase directly for speed
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 50000,
      items: [{ title: "Kurta", priceMinor: 50000, category: "APPAREL" }],
    });
    // Link via receipts not needed: listMerchantPurchasesByUser uses receipts mapping, but our memory impl for listMerchantPurchasesByUser returns via receiptsStore mapping.
    // So we need to create a receipt that points to this purchase to make it visible to summary/ledger.
    // Instead, use createMerchantPurchase via receipts would have linked. For test, insert receipt manually.
    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/test.jpg",
      merchant: "Myntra",
      purchasedAt: new Date(),
      totalMinor: 50000,
      ocrJson: {},
      purchaseId: purchase.purchase.id,
    });

    // Create budget
    const create = await app.inject({
      method: "POST",
      url: "/budgets",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "APPAREL", period: "MONTHLY", limitMinor: 100000 },
    });
    expect(create.statusCode).toBe(201);
    const budget = create.json() as { category: string };
    expect(budget.category).toBe("APPAREL");

    const list = await app.inject({
      method: "GET",
      url: "/budgets",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { budgets: unknown[] }).budgets.length).toBe(1);

    const summary = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const s = summary.json() as {
      totalSpendMinor: number;
      spendByCategory: unknown[];
      budgets: Array<{
        category: string;
        exceeded: boolean;
        envelopeStatus: string;
        alertThresholdHit: boolean;
      }>;
    };
    expect(s.totalSpendMinor).toBe(50000);
    expect(s.spendByCategory.length).toBeGreaterThan(0);
    expect(s.budgets[0].category).toBe("APPAREL");
    expect(s.budgets[0].exceeded).toBe(false);
    expect(s.budgets[0].envelopeStatus).toBe("OK");
    expect(s.budgets[0].alertThresholdHit).toBe(false);

    const ledger = await app.inject({
      method: "GET",
      url: "/accountant/ledger",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(ledger.statusCode).toBe(200);
    const l = ledger.json() as { entries: Array<{ kind: string }> };
    expect(l.entries.some((e) => e.kind === "PURCHASE")).toBe(true);

    await app.close();
  });

  it("budget exceeded flag works and ledger is unified", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    // Tiny budget that will be exceeded
    await app.inject({
      method: "POST",
      url: "/budgets",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "GENERAL", period: "MONTHLY", limitMinor: 1000 },
    });

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Amazon",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 5000,
      items: [{ title: "Shoes", priceMinor: 5000, category: "GENERAL" }],
    });
    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/a.jpg",
      merchant: "Amazon",
      purchasedAt: new Date(),
      totalMinor: 5000,
      ocrJson: {},
      purchaseId: purchase.purchase.id,
    });

    // Add money ledger entry via credits
    await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { kind: "CASH", merchant: "Refund", currency: "INR", balanceMinor: 2000 },
    });

    const summary = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const s = summary.json() as { budgets: Array<{ exceeded: boolean }> };
    expect(s.budgets[0].exceeded).toBe(true);

    const ledger = await app.inject({
      method: "GET",
      url: "/accountant/ledger",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const l = ledger.json() as { entries: Array<{ kind: string }> };
    // Should have both ledger and purchase entries
    expect(l.entries.length).toBeGreaterThanOrEqual(2);
    expect(l.entries.some((e) => e.kind === "LEDGER")).toBe(true);
    expect(l.entries.some((e) => e.kind === "PURCHASE")).toBe(true);

    await app.close();
  });

  it("requires auth for accountant routes", async () => {
    const { app } = await buildTestServer();
    const res = await app.inject({ method: "GET", url: "/accountant/summary" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns 403 when FINANCIAL consent is missing", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("allocates budget actuals per item category (not full order total)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    await app.inject({
      method: "POST",
      url: "/budgets",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "APPAREL", period: "MONTHLY", limitMinor: 100000 },
    });
    await app.inject({
      method: "POST",
      url: "/budgets",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "GENERAL", period: "MONTHLY", limitMinor: 200000 },
    });

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 50000,
      items: [
        { title: "Kurta", priceMinor: 30000, category: "APPAREL" },
        { title: "Sneakers", priceMinor: 20000, category: "FOOTWEAR" },
      ],
    });
    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/split.jpg",
      merchant: "Myntra",
      purchasedAt: new Date(),
      totalMinor: 50000,
      ocrJson: {},
      purchaseId: purchase.purchase.id,
    });

    const summary = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const s = summary.json() as {
      totalSpendMinor: number;
      spendByCategory: Array<{ category: string; totalMinor: number }>;
      budgets: Array<{
        category: string;
        actualMinor: number;
        exceeded: boolean;
      }>;
    };
    expect(s.totalSpendMinor).toBe(50000);

    const apparelSpend = s.spendByCategory.find((c) => c.category === "APPAREL");
    const footwearSpend = s.spendByCategory.find((c) => c.category === "FOOTWEAR");
    expect(apparelSpend?.totalMinor).toBe(30000);
    expect(footwearSpend?.totalMinor).toBe(20000);

    const apparelBudget = s.budgets.find((b) => b.category === "APPAREL");
    const generalBudget = s.budgets.find((b) => b.category === "GENERAL");
    // Per-item: only APPAREL line counts toward APPAREL budget
    expect(apparelBudget?.actualMinor).toBe(30000);
    expect(apparelBudget?.exceeded).toBe(false);
    // GENERAL = full purchase totals in period
    expect(generalBudget?.actualMinor).toBe(50000);

    await app.close();
  });

  it("GET /accountant/export.csv requires FINANCIAL consent and emits CSV", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const denied = await app.inject({
      method: "GET",
      url: "/accountant/export.csv",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(denied.statusCode).toBe(403);

    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { kind: "CASH", merchant: "Refund", currency: "INR", balanceMinor: 1500 },
    });

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 2500,
      items: [{ title: "Tee", priceMinor: 2500, category: "APPAREL" }],
    });
    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/export.jpg",
      merchant: "Myntra",
      purchasedAt: new Date(),
      totalMinor: 2500,
      ocrJson: {},
      purchaseId: purchase.purchase.id,
    });

    const emptyish = await app.inject({
      method: "GET",
      url: "/accountant/export.csv",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(emptyish.statusCode).toBe(200);
    expect(emptyish.headers["content-type"]).toMatch(/text\/csv/);
    const csv = emptyish.body;
    expect(csv).toContain("kind,description,amountMinor,createdAt,refId");
    expect(csv).toContain("LEDGER");
    expect(csv).toContain("PURCHASE");
    expect(csv).toContain("Myntra");
    await app.close();
  });

  it("does not set budget_exceeded when only unrelated category items exist", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    // Tiny APPAREL budget — would be exceeded if we wrongly counted full order
    await app.inject({
      method: "POST",
      url: "/budgets",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "APPAREL", period: "MONTHLY", limitMinor: 1000 },
    });

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Amazon",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 8000,
      items: [{ title: "Running Shoes", priceMinor: 8000, category: "FOOTWEAR" }],
    });
    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/shoes.jpg",
      merchant: "Amazon",
      purchasedAt: new Date(),
      totalMinor: 8000,
      ocrJson: {},
      purchaseId: purchase.purchase.id,
    });

    const summary = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const s = summary.json() as {
      budgets: Array<{ category: string; actualMinor: number; exceeded: boolean }>;
    };
    const apparel = s.budgets.find((b) => b.category === "APPAREL");
    expect(apparel?.actualMinor).toBe(0);
    expect(apparel?.exceeded).toBe(false);

    await app.close();
  });

  it("marks envelope WARN at 80% and queues mid-period push (N42)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });
    // Narrow quiet window so mid-period alert delivery is not delayed in CI.
    await app.deps.repos.updateUser(userId, {
      consentFlags: {
        notifications: {
          quietHoursStart: "03:00",
          quietHoursEnd: "03:01",
          categories: {
            returns: true,
            warranty: true,
            credits: true,
            outfits: true,
            digest: true,
          },
          frequencyCaps: {
            returns: 14,
            warranty: 5,
            credits: 3,
            outfits: 10,
            digest: 1,
          },
        },
      },
    });

    await app.inject({
      method: "POST",
      url: "/budgets",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { category: "APPAREL", period: "MONTHLY", limitMinor: 10_000 },
    });

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 8_500,
      items: [{ title: "Kurta", priceMinor: 8_500, category: "APPAREL" }],
    });
    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/kurta.jpg",
      merchant: "Myntra",
      purchasedAt: new Date(),
      totalMinor: 8_500,
      ocrJson: {},
      purchaseId: purchase.purchase.id,
    });

    const summary = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const s = summary.json() as {
      budgets: Array<{
        category: string;
        actualMinor: number;
        exceeded: boolean;
        envelopeStatus: string;
        alertThresholdHit: boolean;
      }>;
    };
    const apparel = s.budgets.find((b) => b.category === "APPAREL");
    expect(apparel).toMatchObject({
      actualMinor: 8_500,
      exceeded: false,
      envelopeStatus: "WARN",
      alertThresholdHit: true,
    });

    const pushes = await app.deps.push.listEvents(userId);
    expect(pushes.some((p) => p.eventType === "SPEND_ENVELOPE")).toBe(true);

    await app.close();
  });

  it("returns season ROI wears vs cost aggregation", async () => {
    // The season windows below assume items are created in late August (monsoon).
    vi.useFakeTimers({ now: new Date("2026-08-27T12:00:00.000Z"), toFake: ["Date"] });
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    const item = await app.deps.repos.createWardrobeItem({
      userId,
      category: "APPAREL",
      colors: ["blue"],
      brand: "Test",
      costMinor: 10_000,
    });
    await app.deps.repos.createWearLog({
      userId,
      wardrobeItemId: item.id,
      wornOn: new Date("2026-04-15T12:00:00Z"),
    });
    const idle = await app.deps.repos.createWardrobeItem({
      userId,
      category: "APPAREL",
      colors: ["black"],
      brand: "Idle",
      costMinor: 8_000,
    });
    void idle;

    const res = await app.inject({
      method: "GET",
      url: "/accountant/roi/season?year=2026",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      year: number;
      seasons: Array<{
        season: string;
        wears: number;
        costWornMinor: number;
        costIdleMinor: number;
        itemsIdle: number;
      }>;
      totalWears: number;
    };
    expect(body.year).toBe(2026);
    expect(body.totalWears).toBe(1);
    const summer = body.seasons.find((s) => s.season === "SUMMER");
    expect(summer?.wears).toBe(1);
    expect(summer?.costWornMinor).toBe(10_000);
    // Items created "now" (after summer end) are not in summer idle pool
    expect(summer?.itemsIdle).toBe(0);

    const monsoon = body.seasons.find((s) => s.season === "MONSOON");
    // Both items exist by monsoon (created mid-year in tests); neither worn in monsoon
    expect(monsoon?.wears).toBe(0);
    expect(monsoon?.costIdleMinor).toBe(18_000);
    expect(monsoon?.itemsIdle).toBe(2);

    await app.close();
  });

  it("sets cost-per-wear goal, returns progress, and queues nudge push (N41)", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    const item = await app.deps.repos.createWardrobeItem({
      userId,
      category: "APPAREL",
      colors: ["navy"],
      brand: "Navy shirt",
      costMinor: 500_000,
    });

    const set = await app.inject({
      method: "POST",
      url: `/accountant/items/${item.id}/cpw-goal`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { targetCpwMinor: 50_000 },
    });
    expect(set.statusCode).toBe(200);
    const body = set.json() as {
      wardrobeItemId: string;
      targetCpwMinor: number;
      cpwGoal: {
        wearsNeeded: number;
        progress: number;
        remaining: number;
        completed: boolean;
        label: string;
      };
      pushQueued: boolean;
    };
    expect(body.wardrobeItemId).toBe(item.id);
    expect(body.targetCpwMinor).toBe(50_000);
    expect(body.cpwGoal).toMatchObject({
      wearsNeeded: 10,
      progress: 0,
      remaining: 10,
      completed: false,
    });
    expect(body.pushQueued).toBe(true);

    const pushes = await app.deps.push.listEvents(userId);
    expect(pushes.some((p) => p.eventType === "CPW_GOAL")).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: "/accountant/cpw-goals",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const goals = (list.json() as { goals: Array<{ wardrobeItemId: string }> }).goals;
    expect(goals.some((g) => g.wardrobeItemId === item.id)).toBe(true);

    const summary = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const s = summary.json() as {
      cpwGoals: Array<{ wardrobeItemId: string; cpwGoal: { wearsNeeded: number } }>;
    };
    expect(s.cpwGoals?.some((g) => g.wardrobeItemId === item.id && g.cpwGoal.wearsNeeded === 10)).toBe(
      true,
    );

    await app.close();
  });

  it("GET /accountant/tax-pack exports workwear spend+invoices for a date range", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "RECEIPT",
      merchant: "Myntra",
      purchasedAt: new Date("2025-05-10T12:00:00.000Z"),
      currency: "INR",
      totalMinor: 400000,
      items: [{ title: "Work blazer", priceMinor: 400000, category: "APPAREL", brand: "Arrow" }],
    });
    const purchaseItemId = purchase.items[0]!.id;

    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/tax.jpg",
      merchant: "Myntra",
      purchasedAt: new Date("2025-05-10T12:00:00.000Z"),
      totalMinor: 400000,
      ocrJson: { gstin: "29AABCU9603R1ZM" },
      purchaseId: purchase.purchase.id,
    });

    await app.deps.repos.createWardrobeItem({
      userId,
      source: "RECEIPT",
      category: "blazer",
      tags: ["workwear"],
      brand: "Arrow",
      costMinor: 400000,
      imageKeys: ["w.jpg"],
      garmentImageKey: "w.jpg",
      purchaseItemId,
    });
    // Force createdAt into 2025 by re-reading — memory repos set createdAt=now.
    // Use custom from/to around "now" instead if needed; patch via update isn't available for createdAt.
    // Seed a second item with workwear via inject and filter year = current UTC year.
    const year = new Date().getUTCFullYear();

    const denied = await app.inject({
      method: "GET",
      url: `/accountant/tax-pack?year=${year}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // consent already granted — should succeed
    expect(denied.statusCode).toBe(200);
    const pack = denied.json() as {
      year: number | null;
      spendRowCount: number;
      invoiceCount: number;
      totalSpendMinor: number;
      spendCsv: string;
      invoicesCsv: string;
      from: string;
      to: string;
    };
    expect(pack.year).toBe(year);
    expect(pack.spendRowCount).toBeGreaterThanOrEqual(1);
    expect(pack.spendCsv).toContain("blazer");
    expect(pack.from.startsWith(`${year}-01-01`)).toBe(true);
    expect(pack.to.startsWith(`${year}-12-31`)).toBe(true);

    // Custom range that excludes everything (past year with no data)
    const empty = await app.inject({
      method: "GET",
      url: "/accountant/tax-pack?from=2010-01-01&to=2010-12-31",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(empty.statusCode).toBe(200);
    const emptyPack = empty.json() as { spendRowCount: number; invoiceCount: number };
    expect(emptyPack.spendRowCount).toBe(0);

    const zip = await app.inject({
      method: "GET",
      url: `/accountant/tax-pack?year=${year}&format=zip`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(zip.statusCode).toBe(200);
    expect(zip.headers["content-type"]).toMatch(/zip/);
    expect(Buffer.from(zip.rawPayload).subarray(0, 2).toString()).toBe("PK");

    const bad = await app.inject({
      method: "GET",
      url: "/accountant/tax-pack?from=2025-01-01",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(bad.statusCode).toBe(400);

    await app.close();
  });
});
