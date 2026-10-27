import { describe, expect, it } from "vitest";
import {
  allocatePurchaseToBudgetCategories,
  mapCategoryToBudgetCategory,
  budgetPeriodLabel,
  budgetHaulAwarenessMessage,
  budgetNudgeMessage,
  computeBudgetNudges,
  evaluateSpendEnvelope,
  hitsSpendEnvelopeAlertThreshold,
  isBudgetExceeded,
  maybeSendSpendEnvelopeAlert,
  pickPrimaryBudgetNudge,
  spendEnvelopeAlertCopy,
  spendEnvelopeDedupeKey,
  SPEND_ENVELOPE_ALERT_RATIO,
  SPEND_ENVELOPE_EVENT,
} from "./budget.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import type { Repositories } from "./repositories/types.js";

describe("mapCategoryToBudgetCategory", () => {
  it("maps known enums and aliases", () => {
    expect(mapCategoryToBudgetCategory("APPAREL")).toBe("APPAREL");
    expect(mapCategoryToBudgetCategory("kurta")).toBe("APPAREL");
    expect(mapCategoryToBudgetCategory("SNEAKERS")).toBe("FOOTWEAR");
    expect(mapCategoryToBudgetCategory("bag")).toBe("ACCESSORIES");
    expect(mapCategoryToBudgetCategory("makeup")).toBe("BEAUTY");
  });

  it("falls back to GENERAL for unknown / empty", () => {
    expect(mapCategoryToBudgetCategory(null)).toBe("GENERAL");
    expect(mapCategoryToBudgetCategory(undefined)).toBe("GENERAL");
    expect(mapCategoryToBudgetCategory("WIDGET")).toBe("GENERAL");
  });

  it("uses partial keyword matching", () => {
    expect(mapCategoryToBudgetCategory("running shoe")).toBe("FOOTWEAR");
    expect(mapCategoryToBudgetCategory("crossbody bag")).toBe("ACCESSORIES");
    expect(mapCategoryToBudgetCategory("skincare beauty kit")).toBe("BEAUTY");
    expect(mapCategoryToBudgetCategory("cotton clothing")).toBe("APPAREL");
  });
});

describe("allocatePurchaseToBudgetCategories", () => {
  it("allocates only matching item amounts (not full order total)", () => {
    const allocated = allocatePurchaseToBudgetCategories([
      { category: "APPAREL", priceMinor: 30000, qty: 1 },
      { category: "FOOTWEAR", priceMinor: 20000, qty: 1 },
    ]);
    expect(allocated.get("APPAREL")).toBe(30000);
    expect(allocated.get("FOOTWEAR")).toBe(20000);
    expect(allocated.has("GENERAL")).toBe(false);
  });

  it("multiplies by qty and sums same-category lines", () => {
    const allocated = allocatePurchaseToBudgetCategories([
      { category: "APPAREL", priceMinor: 1000, qty: 2 },
      { category: "SHIRT", priceMinor: 500, qty: 1 },
    ]);
    expect(allocated.get("APPAREL")).toBe(2500);
  });

  it("unrelated category does not inflate APPAREL allocation", () => {
    const allocated = allocatePurchaseToBudgetCategories([
      { category: "FOOTWEAR", priceMinor: 8000, qty: 1 },
    ]);
    expect(allocated.get("APPAREL")).toBeUndefined();
    expect(allocated.get("FOOTWEAR")).toBe(8000);
  });
});

describe("isBudgetExceeded", () => {
  it("returns not exceeded when no budget exists", async () => {
    const repos = {
      listBudgets: async () => [],
      listMerchantPurchasesByUser: async () => [],
      listMerchantPurchaseItemsByPurchaseIds: async () => new Map(),
    } as unknown as Repositories;
    expect(await isBudgetExceeded(repos, "u1", "APPAREL")).toEqual({
      exceeded: false,
      limitMinor: null,
      actualMinor: 0,
    });
  });

  it("skips specific-category purchases with no line items (no false positive)", async () => {
    const now = new Date();
    const repos = {
      listBudgets: async () => [
        {
          id: "b1",
          userId: "u1",
          category: "APPAREL",
          period: "MONTHLY",
          limitMinor: 1000,
          createdAt: now,
          updatedAt: now,
        },
      ],
      listMerchantPurchasesByUser: async () => [
        {
          id: "p1",
          userId: "u1",
          source: "RECEIPT",
          merchant: "M",
          orderRef: null,
          purchasedAt: now,
          currency: "INR",
          totalMinor: 50_000,
          createdAt: now,
          updatedAt: now,
        },
      ],
      listMerchantPurchaseItemsByPurchaseIds: async () => new Map([["p1", []]]),
    } as unknown as Repositories;
    const res = await isBudgetExceeded(repos, "u1", "APPAREL");
    expect(res.exceeded).toBe(false);
    expect(res.actualMinor).toBe(0);
  });
});

describe("computeBudgetNudges / pickPrimaryBudgetNudge", () => {
  function mockRepos(opts: {
    budgets: Array<{ category: string; period: "MONTHLY" | "QUARTERLY"; limitMinor: number }>;
  }): Repositories {
    return {
      listBudgets: async () =>
        opts.budgets.map((b, i) => ({
          id: `b${i}`,
          userId: "u1",
          category: b.category as "APPAREL",
          period: b.period,
          limitMinor: b.limitMinor,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      listMerchantPurchasesByUser: async () => [],
      listMerchantPurchaseItemsByPurchaseIds: async () => new Map(),
    } as unknown as Repositories;
  }

  it("returns empty when the user has no budgets", async () => {
    const repos = mockRepos({ budgets: [] });
    expect(await computeBudgetNudges(repos, "u1", [{ category: "APPAREL", priceMinor: 100 }])).toEqual(
      [],
    );
  });

  it("projects proposed spend and prefers an exceeded primary nudge", async () => {
    const repos = mockRepos({
      budgets: [
        { category: "APPAREL", period: "MONTHLY", limitMinor: 1_000 },
        { category: "FOOTWEAR", period: "MONTHLY", limitMinor: 50_000 },
      ],
    });
    const nudges = await computeBudgetNudges(repos, "u1", [
      { category: "SHIRT", priceMinor: 2_000, qty: 1 },
      { category: "SNEAKERS", priceMinor: 500, qty: 1 },
    ]);
    expect(nudges.some((n) => n.category === "APPAREL" && n.exceeded)).toBe(true);
    const primary = pickPrimaryBudgetNudge(nudges);
    expect(primary?.exceeded).toBe(true);
    expect(primary?.category).toBe("APPAREL");
  });

  it("pickPrimaryBudgetNudge falls back to first warning then null", () => {
    expect(
      pickPrimaryBudgetNudge([
        {
          exceeded: false,
          category: "APPAREL",
          limitMinor: 100,
          actualMinor: 0,
          proposedMinor: 10,
          projectedMinor: 10,
          message: "warn",
        },
      ])?.message,
    ).toBe("warn");
    expect(pickPrimaryBudgetNudge([])).toBeNull();
  });
});

describe("computeBudgetNudges (WV08)", () => {
  it("returns exceeded nudge payload when proposed haul blows the cap", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919800011122");
    await repos.createBudget({
      userId: user.id,
      category: "APPAREL",
      period: "MONTHLY",
      limitMinor: 20000,
    });
    const nudges = await computeBudgetNudges(repos, user.id, [
      { category: "APPAREL", priceMinor: 50000, qty: 1 },
    ]);
    expect(nudges.some((n) => n.exceeded && n.category === "APPAREL")).toBe(true);
    const primary = pickPrimaryBudgetNudge(nudges);
    expect(primary?.exceeded).toBe(true);
    expect(primary?.projectedMinor).toBe(50000);
    expect(primary?.message).toMatch(/budget/i);
  });
});

describe("budget nudge soft copy (W085)", () => {
  it("uses soft language without shame or hard block", () => {
    const exceeded = budgetNudgeMessage("APPAREL", 10_000, 12_000);
    expect(exceeded).toMatch(/Heads-up/i);
    expect(exceeded.toLowerCase()).not.toMatch(/you've spent|cannot|blocked|must stop/);
    const warn = budgetHaulAwarenessMessage("APPAREL", 2_000, 10_000);
    expect(warn).toMatch(/soft nudge only/i);
  });
});

describe("spend envelopes (N42) — mid-period 80% threshold", () => {
  it("hits alert threshold at exactly 80%", () => {
    expect(SPEND_ENVELOPE_ALERT_RATIO).toBe(0.8);
    expect(hitsSpendEnvelopeAlertThreshold(8_000, 10_000)).toBe(true);
    expect(hitsSpendEnvelopeAlertThreshold(7_999, 10_000)).toBe(false);
    expect(hitsSpendEnvelopeAlertThreshold(0, 10_000)).toBe(false);
    expect(hitsSpendEnvelopeAlertThreshold(1, 0)).toBe(false);
  });

  it("evaluateSpendEnvelope maps OK / WARN / EXCEEDED", () => {
    expect(evaluateSpendEnvelope(4_000, 10_000)).toEqual({
      ratio: 0.4,
      status: "OK",
      alertThresholdHit: false,
    });
    expect(evaluateSpendEnvelope(8_000, 10_000)).toMatchObject({
      status: "WARN",
      alertThresholdHit: true,
    });
    expect(evaluateSpendEnvelope(10_001, 10_000)).toMatchObject({
      status: "EXCEEDED",
      alertThresholdHit: true,
    });
  });

  it("builds period labels and dedupe keys", () => {
    const now = new Date(2026, 7, 20); // Aug 2026
    expect(budgetPeriodLabel("MONTHLY", now)).toBe("2026-08");
    expect(budgetPeriodLabel("QUARTERLY", now)).toBe("2026-Q3");
    expect(spendEnvelopeDedupeKey("u1", "APPAREL", "2026-08")).toBe(
      "spend-envelope:u1:APPAREL:2026-08",
    );
    expect(spendEnvelopeAlertCopy("APPAREL", 10_000, 8_000).title).toMatch(/80%/);
  });

  it("sends mid-period WARN push once per period (deduped)", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919800022233");
    await repos.updateUser(user.id, { pushToken: "ExponentPushToken[env]" });
    // Noon UTC — outside default quiet hours (22:00–07:00 UTC)
    const now = new Date(Date.UTC(2026, 7, 15, 12, 0, 0));

    const first = await maybeSendSpendEnvelopeAlert(repos, {
      userId: user.id,
      category: "APPAREL",
      period: "MONTHLY",
      limitMinor: 10_000,
      actualMinor: 8_500,
      now,
      sendExpo: async () => ({ ok: true as const, ticketId: "ticket-env" }),
    });
    expect(["sent", "queued"]).toContain(first);

    const events = await repos.listPushEvents(user.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe(SPEND_ENVELOPE_EVENT);
    expect(events[0]?.dedupeKey).toBe(
      spendEnvelopeDedupeKey(user.id, "APPAREL", budgetPeriodLabel("MONTHLY", now)),
    );

    const second = await maybeSendSpendEnvelopeAlert(repos, {
      userId: user.id,
      category: "APPAREL",
      period: "MONTHLY",
      limitMinor: 10_000,
      actualMinor: 9_000,
      now: new Date(Date.UTC(2026, 7, 20, 12, 0, 0)),
    });
    expect(second).toBe("skipped");
    expect(await repos.listPushEvents(user.id)).toHaveLength(1);
  });

  it("skips push when under 80% or already exceeded", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919800033344");
    expect(
      await maybeSendSpendEnvelopeAlert(repos, {
        userId: user.id,
        category: "FOOTWEAR",
        period: "MONTHLY",
        limitMinor: 10_000,
        actualMinor: 5_000,
      }),
    ).toBe("skipped");
    expect(
      await maybeSendSpendEnvelopeAlert(repos, {
        userId: user.id,
        category: "FOOTWEAR",
        period: "MONTHLY",
        limitMinor: 10_000,
        actualMinor: 12_000,
      }),
    ).toBe("skipped");
    expect(await repos.listPushEvents(user.id)).toHaveLength(0);
  });
});
