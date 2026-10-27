import { localParts, resolveTimeZone, zonedTimeToInstant, type sendExpoPush } from "@worn/shared";
import { trackServerEvent } from "./analytics.js";
import type { BudgetRecord, MerchantPurchaseRecord, Repositories } from "./repositories/types.js";

export const categoryToBudgetCategory: Record<string, string> = {
  // APPAREL bucket
  APPAREL: "APPAREL",
  CLOTHING: "APPAREL",
  KURTA: "APPAREL",
  KURTI: "APPAREL",
  SAREE: "APPAREL",
  BLOUSE: "APPAREL",
  SUIT: "APPAREL",
  SHIRT: "APPAREL",
  DRESS: "APPAREL",
  TOP: "APPAREL",
  JEANS: "APPAREL",
  TROUSERS: "APPAREL",
  // FOOTWEAR
  SHOES: "FOOTWEAR",
  SHOE: "FOOTWEAR",
  FOOTWEAR: "FOOTWEAR",
  SNEAKERS: "FOOTWEAR",
  SANDALS: "FOOTWEAR",
  HEELS: "FOOTWEAR",
  BOOTS: "FOOTWEAR",
  // ACCESSORIES
  ACCESSORIES: "ACCESSORIES",
  ACCESSORY: "ACCESSORIES",
  BAG: "ACCESSORIES",
  BAGS: "ACCESSORIES",
  WATCH: "ACCESSORIES",
  JEWELRY: "ACCESSORIES",
  JEWELLERY: "ACCESSORIES",
  BELT: "ACCESSORIES",
  // BEAUTY
  BEAUTY: "BEAUTY",
  COSMETICS: "BEAUTY",
  MAKEUP: "BEAUTY",
  SKINCARE: "BEAUTY",
  PERFUME: "BEAUTY",
  // GENERAL is fallback
  GENERAL: "GENERAL",
};

export function mapCategoryToBudgetCategory(raw: string | null | undefined): string {
  if (!raw) return "GENERAL";
  const upper = raw.toUpperCase().trim();
  if (categoryToBudgetCategory[upper]) return categoryToBudgetCategory[upper];
  // partial match: if contains footwear keyword treat as FOOTWEAR etc.
  if (upper.includes("SHOE") || upper.includes("FOOTWEAR") || upper.includes("SNEAKER") || upper.includes("SANDAL")) return "FOOTWEAR";
  if (upper.includes("BAG") || upper.includes("WATCH") || upper.includes("JEWEL")) return "ACCESSORIES";
  if (upper.includes("BEAUTY") || upper.includes("COSMET") || upper.includes("MAKEUP")) return "BEAUTY";
  if (upper.includes("KURTA") || upper.includes("SAREE") || upper.includes("BLOUSE") || upper.includes("SUIT") || upper.includes("APPAREL") || upper.includes("CLOTH")) return "APPAREL";
  return "GENERAL";
}

/** Per-item allocation: distribute purchase total across budget categories by item priceMinor*qty */
export function allocatePurchaseToBudgetCategories(
  items: Array<{ category: string | null; priceMinor: number; qty: number }>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const bc = mapCategoryToBudgetCategory(it.category);
    const amount = it.priceMinor * it.qty;
    m.set(bc, (m.get(bc) ?? 0) + amount);
  }
  return m;
}

/** Start of the budget period holding `now` in the user's time zone (C1), never server time. */
export function budgetPeriodStart(period: string, now: Date, timeZone: string): Date {
  const { year, month } = localParts(now, timeZone);
  const first = period === "MONTHLY" ? month : Math.floor((month - 1) / 3) * 3 + 1;
  return zonedTimeToInstant(
    `${String(year).padStart(4, "0")}-${String(first).padStart(2, "0")}-01`,
    "00:00",
    timeZone,
  );
}

/**
 * Spend counted against one budget since `periodStart`. GENERAL takes whole purchases; a
 * specific category takes only its matching line items, so a purchase with no item detail
 * never counts against it (no false budget_exceeded).
 */
export function budgetActualMinor(
  category: string,
  purchases: MerchantPurchaseRecord[],
  itemsByPurchase: Map<string, Array<{ category: string | null; priceMinor: number; qty: number }>>,
  periodStart: Date,
): number {
  let actual = 0;
  for (const p of purchases) {
    if (new Date(p.purchasedAt) < periodStart) continue;
    if (category === "GENERAL") {
      actual += p.totalMinor;
      continue;
    }
    actual += allocatePurchaseToBudgetCategories(itemsByPurchase.get(p.id) ?? []).get(category) ?? 0;
  }
  return actual;
}

/** Current-period actual for each budget: one purchase read and one item read for all of them. */
export async function budgetActuals(
  repos: Repositories,
  userId: string,
  budgets: BudgetRecord[],
  now: Date,
): Promise<Array<{ budget: BudgetRecord; actualMinor: number }>> {
  if (budgets.length === 0) return [];
  const timeZone = resolveTimeZone((await repos.findUserById(userId))?.timeZone);
  const starts = budgets.map((b) => budgetPeriodStart(b.period, now, timeZone));
  const earliest = Math.min(...starts.map((d) => d.getTime()));
  // A DUPLICATE (merged or backfilled #38 duplicate) is not spend; its lines may still exist.
  const purchases = (await repos.listMerchantPurchasesByUser(userId)).filter(
    (p) => p.status !== "DUPLICATE" && new Date(p.purchasedAt).getTime() >= earliest,
  );
  const itemsMap = purchases.length
    ? await repos.listMerchantPurchaseItemsByPurchaseIds(purchases.map((p) => p.id))
    : new Map();
  return budgets.map((budget, i) => ({
    budget,
    actualMinor: budgetActualMinor(budget.category, purchases, itemsMap, starts[i]!),
  }));
}

export async function isBudgetExceeded(
  repos: Repositories,
  userId: string,
  category: string,
): Promise<{ exceeded: boolean; limitMinor: number | null; actualMinor: number }> {
  const budgets = await repos.listBudgets(userId);
  const budget =
    budgets.find((b) => b.category === category) ?? budgets.find((b) => b.category === "GENERAL");
  if (!budget) return { exceeded: false, limitMinor: null, actualMinor: 0 };
  const [{ actualMinor }] = await budgetActuals(repos, userId, [budget], new Date());
  return { exceeded: actualMinor > budget.limitMinor, limitMinor: budget.limitMinor, actualMinor };
}

/** Soft spend-awareness copy (W085) — heads-up, never shame or block. */
export function budgetNudgeMessage(category: string, limitMinor: number, actualMinor: number): string {
  const spent = actualMinor / 100;
  const limit = limitMinor / 100;
  return `Heads-up: this haul would put your ${category} budget around ${spent} of ${limit} this period.`;
}

/** Soft non-exceeded projection copy for haul awareness. */
export function budgetHaulAwarenessMessage(
  category: string,
  proposedMinor: number,
  limitMinor: number,
): string {
  return `This haul uses about ${proposedMinor / 100} of your ${limitMinor / 100} ${category} budget — soft nudge only.`;
}

export type BudgetNudgePayload = {
  exceeded: boolean;
  category: string;
  limitMinor: number;
  actualMinor: number;
  proposedMinor: number;
  projectedMinor: number;
  message: string;
};

/**
 * Soft spend-awareness nudge for Play checkout: project proposed items onto
 * category budgets. Never blocks — caller surfaces soft UI only.
 */
export async function computeBudgetNudges(
  repos: Repositories,
  userId: string,
  proposedItems: Array<{ category: string | null; priceMinor: number; qty?: number }>,
): Promise<BudgetNudgePayload[]> {
  const budgets = await repos.listBudgets(userId);
  if (budgets.length === 0) return [];

  const proposedByCat = allocatePurchaseToBudgetCategories(
    proposedItems.map((it) => ({
      category: it.category,
      priceMinor: it.priceMinor,
      qty: it.qty ?? 1,
    })),
  );
  let proposedGeneral = 0;
  for (const v of proposedByCat.values()) proposedGeneral += v;

  const nudges: BudgetNudgePayload[] = [];
  for (const { budget: b, actualMinor } of await budgetActuals(repos, userId, budgets, new Date())) {
    const status = { actualMinor, exceeded: actualMinor > b.limitMinor };
    const proposed =
      b.category === "GENERAL" ? proposedGeneral : (proposedByCat.get(b.category) ?? 0);
    if (proposed <= 0 && !status.exceeded) continue;
    const projected = status.actualMinor + proposed;
    const exceeded = projected > b.limitMinor;
    if (!exceeded && proposed <= 0) continue;
    nudges.push({
      exceeded,
      category: b.category,
      limitMinor: b.limitMinor,
      actualMinor: status.actualMinor,
      proposedMinor: proposed,
      projectedMinor: projected,
      message: exceeded
        ? budgetNudgeMessage(b.category, b.limitMinor, projected)
        : budgetHaulAwarenessMessage(b.category, proposed, b.limitMinor),
    });
  }
  return nudges;
}

/** Primary soft nudge for UI (first exceeded, else first warning). */
export function pickPrimaryBudgetNudge(
  nudges: BudgetNudgePayload[],
): BudgetNudgePayload | null {
  return nudges.find((n) => n.exceeded) ?? nudges[0] ?? null;
}

/** Mid-period spend-envelope warning (N42): alert once spend hits 80% of the cap. */
export const SPEND_ENVELOPE_ALERT_RATIO = 0.8;
export const SPEND_ENVELOPE_EVENT = "SPEND_ENVELOPE";

export type SpendEnvelopeStatus = "OK" | "WARN" | "EXCEEDED";

export type SpendEnvelopeEvaluation = {
  ratio: number;
  status: SpendEnvelopeStatus;
  /** True when actual ≥ 80% of limit (includes exceeded). */
  alertThresholdHit: boolean;
};

/** Stable period key for dedupe / rollups, e.g. `2026-08` or `2026-Q3`, in the user's time zone. */
export function budgetPeriodLabel(
  period: "MONTHLY" | "QUARTERLY",
  now: Date,
  timeZone: string,
): string {
  const { year, month } = localParts(now, timeZone);
  if (period === "MONTHLY") {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  const q = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${q}`;
}

export function spendEnvelopeDedupeKey(
  userId: string,
  category: string,
  periodLabel: string,
): string {
  return `spend-envelope:${userId}:${category}:${periodLabel}`;
}

/**
 * True when spend has reached the mid-period envelope threshold (default 80%).
 * Zero/negative limits never alert.
 */
export function hitsSpendEnvelopeAlertThreshold(
  actualMinor: number,
  limitMinor: number,
  alertRatio: number = SPEND_ENVELOPE_ALERT_RATIO,
): boolean {
  if (limitMinor <= 0 || alertRatio <= 0) return false;
  return actualMinor >= limitMinor * alertRatio;
}

export function evaluateSpendEnvelope(
  actualMinor: number,
  limitMinor: number,
  alertRatio: number = SPEND_ENVELOPE_ALERT_RATIO,
): SpendEnvelopeEvaluation {
  const ratio = limitMinor <= 0 ? (actualMinor > 0 ? Number.POSITIVE_INFINITY : 0) : actualMinor / limitMinor;
  const alertThresholdHit = hitsSpendEnvelopeAlertThreshold(actualMinor, limitMinor, alertRatio);
  if (actualMinor > limitMinor && limitMinor > 0) {
    return { ratio, status: "EXCEEDED", alertThresholdHit: true };
  }
  if (alertThresholdHit) {
    return { ratio, status: "WARN", alertThresholdHit: true };
  }
  return { ratio, status: "OK", alertThresholdHit: false };
}

export function spendEnvelopeAlertCopy(
  category: string,
  limitMinor: number,
  actualMinor: number,
): { title: string; body: string } {
  const pct = Math.round((actualMinor / Math.max(limitMinor, 1)) * 100);
  return {
    title: `${category} envelope at ${pct}%`,
    body: `You've used ${actualMinor / 100} of your ${limitMinor / 100} ${category} budget this period — mid-period heads-up before you blow the cap.`,
  };
}

/** Minimal push surface — compatible with `Repositories` (N42). */
type SpendEnvelopePushRepos = {
  listPushEvents: (userId?: string) => Promise<Array<{ dedupeKey: string }>>;
  recordPushEvent: (input: {
    userId: string;
    orderId: string | null;
    eventType: string;
    title: string;
    body: string;
    dedupeKey: string;
    payload: { deepLink: string; screen: string; [key: string]: unknown };
    status: "QUEUED" | "SENT" | "FAILED";
  }) => Promise<{ id: string }>;
  findUserById: (id: string) => Promise<{
    prefs: Record<string, unknown>;
    pushToken: string | null;
    timeZone: string;
  } | null>;
  updatePushEventStatus?: (
    id: string,
    status: "SENT" | "FAILED",
    expoTicketId?: string | null,
  ) => Promise<void>;
};

/**
 * Fire a once-per-period mid-envelope push when status is WARN (80%…100%).
 * Quiet hours / delivery via shared Closet push flow. Idempotent via dedupeKey.
 */
export async function maybeSendSpendEnvelopeAlert(
  repos: SpendEnvelopePushRepos,
  input: {
    userId: string;
    category: string;
    period: "MONTHLY" | "QUARTERLY";
    limitMinor: number;
    actualMinor: number;
    now?: Date;
    sendExpo?: typeof sendExpoPush;
  },
): Promise<"sent" | "queued" | "skipped" | "delayed" | "failed"> {
  const envelope = evaluateSpendEnvelope(input.actualMinor, input.limitMinor);
  // Mid-period alert only — exceeded is tracked separately via budget_exceeded.
  if (envelope.status !== "WARN") return "skipped";

  const now = input.now ?? new Date();
  const user = await repos.findUserById(input.userId);
  if (!user) return "skipped";
  const periodLabel = budgetPeriodLabel(input.period, now, resolveTimeZone(user.timeZone));
  const dedupeKey = spendEnvelopeDedupeKey(input.userId, input.category, periodLabel);

  const existing = await repos.listPushEvents(input.userId);
  if (existing.some((e) => e.dedupeKey === dedupeKey)) return "skipped";

  const copy = spendEnvelopeAlertCopy(input.category, input.limitMinor, input.actualMinor);
  const { runClosetPushDelivery } = await import("@worn/shared");

  const result = await runClosetPushDelivery({
    eventType: SPEND_ENVELOPE_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: copy.title,
    body: copy.body,
    deepLinkExtra: { category: input.category, periodLabel },
    payloadExtra: {
      category: input.category,
      period: input.period,
      periodLabel,
      limitMinor: input.limitMinor,
      actualMinor: input.actualMinor,
      ratio: envelope.ratio,
    },
    now,
    sendExpo: input.sendExpo,
    insertQueued: async ({ title, body, payload }) => {
      const deepLink =
        typeof payload.deepLink === "string" ? payload.deepLink : "worn://accountant";
      const screen = typeof payload.screen === "string" ? payload.screen : "accountant";
      const event = await repos.recordPushEvent({
        userId: input.userId,
        orderId: null,
        eventType: SPEND_ENVELOPE_EVENT,
        title,
        body,
        dedupeKey,
        payload: { ...payload, deepLink, screen },
        status: "QUEUED",
      });
      return { id: event.id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });

  if (result.status === "delayed") return "delayed";
  if (result.status === "skipped") return "skipped";
  if (result.status === "queued") return "queued";
  if (result.status === "sent") return "sent";
  return "failed";
}

/**
 * N42: after a purchase is recorded, send the 80% envelope push for each budget now in WARN.
 * Runs from the write path (receipt confirm, Play track), never from a GET. Each push is
 * deduped per period by the unique push_events.dedupe_key.
 */
export async function sendSpendEnvelopeAlerts(
  repos: Repositories,
  userId: string,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
): Promise<Array<{ category: string; status: Awaited<ReturnType<typeof maybeSendSpendEnvelopeAlert>> }>> {
  const now = opts.now ?? new Date();
  const budgets = await repos.listBudgets(userId);
  const results = [];
  for (const { budget, actualMinor } of await budgetActuals(repos, userId, budgets, now)) {
    if (evaluateSpendEnvelope(actualMinor, budget.limitMinor).status !== "WARN") continue;
    const status = await maybeSendSpendEnvelopeAlert(repos, {
      userId,
      category: budget.category,
      period: budget.period,
      limitMinor: budget.limitMinor,
      actualMinor,
      now,
      sendExpo: opts.sendExpo,
    });
    if (status === "sent" || status === "queued") {
      trackServerEvent("spend_envelope_alerted", {
        userId,
        category: budget.category,
        limitMinor: budget.limitMinor,
        actualMinor,
      });
    }
    results.push({ category: budget.category, status });
  }
  return results;
}
