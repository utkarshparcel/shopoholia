import {
  AccountantLedgerResponseSchema,
  AccountantSeasonRoiSchema,
  AccountantSummarySchema,
  BudgetsResponseSchema,
  CreateBudgetBodySchema,
  CpwGoalsResponseSchema,
  SetCpwGoalBodySchema,
  SetCpwGoalResponseSchema,
  PageQuerySchema,
  TaxPackResponseSchema,
  collectCpwThresholdAlerts,
  cpwGoalNudgeCopy,
  cpwGoalProgress,
  localMonthRange,
  resolveTimeZone,
  sumRepairSpend,
} from "@worn/shared";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { requireConsent } from "../lib/auth/consent.js";
import { requireEntitlement } from "../lib/entitlements.js";
import { trackServerEvent } from "../lib/analytics.js";
import { audit } from "../lib/audit.js";
import {
  allocatePurchaseToBudgetCategories,
  budgetActualMinor,
  budgetPeriodStart,
  evaluateSpendEnvelope,
  isBudgetExceeded,
} from "../lib/budget.js";
import { scheduleAccountantMonthlyDigest } from "../lib/accountant-jobs.js";
import { reconcileMoneyAccounts } from "../lib/money-reconcile.js";
import {
  annotateUserMismatches,
  markReconcileInvestigated,
  reconcileMismatchActions,
} from "../lib/user-reconcile.js";
import { getCpwThreshold, setCpwThreshold } from "../lib/closet-ops-prefs.js";
import { aggregateSeasonRoi } from "../lib/roi-season.js";
import {
  buildStoreZip,
  buildWorkwearTaxPack,
  resolveTaxPackRange,
} from "../lib/tax-pack.js";
import { decodeCursor, InvalidCursorError, pageInMemory } from "../lib/paging.js";
import type { BudgetRecord, WardrobeItemRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toBudgetJson(b: BudgetRecord) {
  return {
    id: b.id,
    userId: b.userId,
    category: b.category,
    period: b.period,
    limitMinor: b.limitMinor,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export const accountantRoutes: FastifyPluginAsyncZod = async (app) => {
  /** One wardrobe read for a metrics loop, instead of a findWardrobeItem per metric (#18). */
  const wardrobeItemsById = async (userId: string) =>
    new Map((await app.deps.repos.listWardrobeItems(userId)).map((i) => [i.id, i]));

  // GET /accountant/summary - P&L: spend by category, costPerWear, budgets vs actual
  app.get(
    "/accountant/summary",
    {
      preHandler: [
        requireAuth,
        requireConsent("FINANCIAL"),
        requireEntitlement("accountant"),
      ],
      schema: {
        tags: ["accountant"],
        response: {
          200: AccountantSummarySchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const timeZone = resolveTimeZone((await app.deps.repos.findUserById(userId))?.timeZone);
      // A DUPLICATE (merged or backfilled #38 duplicate) is not spend; its lines may still exist.
      const purchases = (await app.deps.repos.listMerchantPurchasesByUser(userId)).filter(
        (p) => p.status !== "DUPLICATE",
      );
      const metrics = await app.deps.repos.getItemMetrics(userId);
      const budgets = await app.deps.repos.listBudgets(userId);
      const repairs = await app.deps.repos.listRepairLogs(userId);

      // Batch-fetch all purchase items once (M8)
      const purchaseIds = purchases.map((p) => p.id);
      const itemsByPurchase =
        await app.deps.repos.listMerchantPurchaseItemsByPurchaseIds(purchaseIds);

      const now = new Date();
      // "This month" is the user's local month (C1), not the server's.
      const { start: monthStart, monthKey: monthLabel } = localMonthRange(now, timeZone);
      const repairSpend = sumRepairSpend(repairs, { monthStart, now });

      // spend by category via per-item budget-category allocation (M7)
      const spendMap = new Map<string, number>();
      let totalSpend = 0;
      let monthlySpendMinor = 0;
      for (const p of purchases) {
        totalSpend += p.totalMinor;
        if (new Date(p.purchasedAt) >= monthStart) {
          monthlySpendMinor += p.totalMinor;
        }
        const items = itemsByPurchase.get(p.id) ?? [];
        const allocated = allocatePurchaseToBudgetCategories(items);
        for (const [cat, amount] of allocated) {
          spendMap.set(cat, (spendMap.get(cat) ?? 0) + amount);
        }
      }
      // fallback: if no items categorized, put total as GENERAL
      if (spendMap.size === 0 && totalSpend > 0) {
        spendMap.set("GENERAL", totalSpend);
      }

      const spendByCategory = [...spendMap.entries()].map(([category, totalMinor]) => ({
        period: monthLabel,
        category,
        totalMinor,
      }));

      const vals = metrics.map((m) => m.costPerWearMinor).filter((v): v is number => typeof v === "number" && v !== null);
      const avgCostPerWearMinor = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;

      // budgets vs actual (current period) — per-item allocation, not full purchase total
      const budgetSummaries = budgets.map((b) => {
        const actual = budgetActualMinor(
          b.category,
          purchases,
          itemsByPurchase,
          budgetPeriodStart(b.period, now, timeZone),
        );
        const envelope = evaluateSpendEnvelope(actual, b.limitMinor);
        const exceeded = envelope.status === "EXCEEDED";
        if (exceeded) {
          trackServerEvent("budget_exceeded", {
            userId,
            category: b.category,
            limitMinor: b.limitMinor,
            actualMinor: actual,
          });
        }
        return {
          category: b.category as "APPAREL" | "FOOTWEAR" | "ACCESSORIES" | "BEAUTY" | "GENERAL",
          period: b.period as "MONTHLY" | "QUARTERLY",
          limitMinor: b.limitMinor,
          actualMinor: actual,
          exceeded,
          envelopeStatus: envelope.status,
          alertThresholdHit: envelope.alertThresholdHit,
        };
      });

      // N42: the 80% envelope push is sent from the purchase write paths (sendSpendEnvelopeAlerts), never from this GET.

      audit(app.log, "money.read", { userId, surface: "accountant.summary" });
      trackServerEvent("accountant_viewed", { userId, totalSpendMinor: totalSpend });

      // WV08-MONTHLY-DIGEST — idempotent enqueue for current UTC month (best-effort)
      void scheduleAccountantMonthlyDigest(userId, {
        monthlySpendMinor,
        avgCostPerWearMinor,
        costPerWearMinor: avgCostPerWearMinor,
        monthLabel,
      }).catch(() => undefined);

      const cpwGoals: Array<{
        wardrobeItemId: string;
        brand: string | null;
        category: string;
        costMinor: number;
        cpwGoal: ReturnType<typeof cpwGoalProgress>;
      }> = [];
      const goalItems = metrics.some((m) => m.targetCpwMinor != null && m.targetCpwMinor > 0)
        ? await wardrobeItemsById(userId)
        : new Map<string, WardrobeItemRecord>();
      for (const m of metrics) {
        if (m.targetCpwMinor == null || m.targetCpwMinor <= 0) continue;
        const item = goalItems.get(m.wardrobeItemId);
        const costMinor = item?.costMinor ?? 0;
        const goal = cpwGoalProgress(costMinor, m.wearCount, m.targetCpwMinor);
        if (!goal.active) continue;
        cpwGoals.push({
          wardrobeItemId: m.wardrobeItemId,
          brand: item?.brand ?? null,
          category: item?.category ?? "APPAREL",
          costMinor,
          cpwGoal: goal,
        });
      }

      return {
        monthLabel,
        monthlySpendMinor,
        totalSpendMinor: totalSpend,
        spendByCategory,
        costPerWearMinor: avgCostPerWearMinor,
        avgCostPerWearMinor,
        budgets: budgetSummaries,
        cpwGoals,
        repairSpendMinor: repairSpend.totalMinor,
        monthlyRepairSpendMinor: repairSpend.monthlyMinor,
      };
    },
  );

  // GET /accountant/roi/season — wardrobe ROI by India closet season (wears vs cost)
  app.get(
    "/accountant/roi/season",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        querystring: z.object({
          year: z.coerce.number().int().min(2000).max(2100).optional(),
        }),
        response: { 200: AccountantSeasonRoiSchema, 401: ErrorSchema, 403: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const year = request.query.year ?? new Date().getUTCFullYear();
      const [items, wearLogs] = await Promise.all([
        app.deps.repos.listWardrobeItems(userId),
        app.deps.repos.listWearLogs(userId),
      ]);
      const report = aggregateSeasonRoi({
        year,
        items: items.map((i) => ({
          id: i.id,
          costMinor: i.costMinor,
          createdAt: i.createdAt,
        })),
        wearLogs: wearLogs.map((w) => ({
          wardrobeItemId: w.wardrobeItemId,
          wornOn: w.wornOn,
        })),
      });
      audit(app.log, "money.read", { userId, surface: "accountant.roi.season", year });
      trackServerEvent("accountant_roi_season_viewed", {
        userId,
        year,
        totalWears: report.totalWears,
        totalCostIdleMinor: report.totalCostIdleMinor,
      });
      return report;
    },
  );

  // GET /accountant/ledger - unified money_ledger + merchant_purchases ledger
  app.get(
    "/accountant/ledger",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        querystring: PageQuerySchema,
        response: { 200: AccountantLedgerResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      let after;
      try {
        after = decodeCursor(request.query.cursor);
      } catch (err) {
        if (err instanceof InvalidCursorError) return reply.code(400).send(err.body);
        throw err;
      }
      const ledger = await app.deps.repos.listMoneyLedgerByUser(userId);
      const purchases = await app.deps.repos.listMerchantPurchasesByUser(userId);
      const repairs = await app.deps.repos.listRepairLogs(userId);

      const entries: Array<{
        id: string;
        kind: "PURCHASE" | "LEDGER" | "REPAIR";
        description: string;
        amountMinor: number;
        createdAt: string;
        refId: string | null;
        refType?: string | null;
      }> = [];

      for (const l of ledger) {
        entries.push({
          id: l.id,
          kind: "LEDGER",
          description: `${l.type} ${l.refType ?? ""}`.trim(),
          amountMinor: l.delta,
          createdAt: l.createdAt.toISOString(),
          refId: l.refId,
          refType: l.refType ?? null,
        });
      }
      for (const p of purchases) {
        entries.push({
          id: p.id,
          kind: "PURCHASE",
          description: `${p.merchant} purchase`,
          amountMinor: -p.totalMinor,
          createdAt: p.createdAt.toISOString(),
          refId: p.id,
        });
      }
      for (const r of repairs) {
        entries.push({
          id: r.id,
          kind: "REPAIR",
          description: `${r.kind.toLowerCase()} repair`,
          amountMinor: -r.costMinor,
          createdAt: `${r.repairedOn}T12:00:00.000Z`,
          refId: r.wardrobeItemId,
        });
      }

      // One page, newest first (C3): `limit` entries and a cursor to the next page.
      const page = pageInMemory(
        entries,
        request.query.limit,
        after,
        (e) => new Date(e.createdAt),
        (e) => e.id,
      );

      audit(app.log, "money.read", { userId, surface: "accountant.ledger", entryCount: page.items.length });
      trackServerEvent("ledger_viewed", { userId, entryCount: page.items.length });
      return { entries: page.items, nextCursor: page.nextCursor };
    },
  );

  // GET /accountant/export.csv — ledger + purchases as CSV (FINANCIAL consent)
  app.get(
    "/accountant/export.csv",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        response: {
          200: z.string(),
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const ledger = await app.deps.repos.listMoneyLedgerByUser(userId);
      const purchases = await app.deps.repos.listMerchantPurchasesByUser(userId);

      const rows: Array<{ kind: string; description: string; amountMinor: number; createdAt: string; refId: string }> = [];
      for (const l of ledger) {
        rows.push({
          kind: "LEDGER",
          description: `${l.type} ${l.refType ?? ""}`.trim(),
          amountMinor: l.delta,
          createdAt: l.createdAt.toISOString(),
          refId: l.refId ?? "",
        });
      }
      for (const p of purchases) {
        rows.push({
          kind: "PURCHASE",
          description: `${p.merchant} purchase`,
          amountMinor: -p.totalMinor,
          createdAt: p.createdAt.toISOString(),
          refId: p.id,
        });
      }
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const header = "kind,description,amountMinor,createdAt,refId";
      const body = rows
        .map(
          (r) =>
            [
              csvEscape(r.kind),
              csvEscape(r.description),
              String(r.amountMinor),
              csvEscape(r.createdAt),
              csvEscape(r.refId),
            ].join(","),
        )
        .join("\n");
      const csv = body ? `${header}\n${body}\n` : `${header}\n`;

      audit(app.log, "money.read", { userId, surface: "accountant.export", entryCount: rows.length });
      trackServerEvent("accountant_exported", { userId, entryCount: rows.length });
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", 'attachment; filename="closet-ledger.csv"')
        .send(csv);
    },
  );

  // GET /accountant/tax-pack — N44 workwear yearly invoices + spend (CSV/ZIP/JSON)
  app.get(
    "/accountant/tax-pack",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        querystring: z.object({
          year: z.coerce.number().int().min(2000).max(2100).optional(),
          from: z.string().min(4).optional(),
          to: z.string().min(4).optional(),
          format: z.enum(["json", "csv", "zip"]).optional().default("json"),
        }),
        response: {
          200: TaxPackResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const q = request.query;
      const rangeOrErr = resolveTaxPackRange({
        year: q.year,
        from: q.from,
        to: q.to,
      });
      if ("error" in rangeOrErr) {
        return reply.code(400).send({ error: "Bad Request", message: rangeOrErr.error });
      }

      const [items, receipts, purchases] = await Promise.all([
        app.deps.repos.listWardrobeItems(userId),
        app.deps.repos.listReceipts(userId),
        app.deps.repos.listMerchantPurchasesByUser(userId),
      ]);
      const purchaseIds = purchases.map((p) => p.id);
      const itemsByPurchase =
        await app.deps.repos.listMerchantPurchaseItemsByPurchaseIds(purchaseIds);
      const purchaseIdByItemId = new Map<string, string>();
      for (const [purchaseId, purchaseItems] of itemsByPurchase) {
        for (const pi of purchaseItems) {
          purchaseIdByItemId.set(pi.id, purchaseId);
        }
      }

      const pack = buildWorkwearTaxPack({
        range: rangeOrErr,
        wardrobeItems: items,
        receipts,
        purchaseIdByItemId,
      });

      audit(app.log, "money.read", {
        userId,
        surface: "accountant.tax_pack",
        label: pack.label,
        spendRowCount: pack.spendRowCount,
        invoiceCount: pack.invoiceCount,
      });
      trackServerEvent("accountant_tax_pack_exported", {
        userId,
        label: pack.label,
        spendRowCount: pack.spendRowCount,
        invoiceCount: pack.invoiceCount,
        totalSpendMinor: pack.totalSpendMinor,
        format: q.format ?? "json",
      });

      const format = q.format ?? "json";
      // CSV and ZIP bodies skip the JSON serializer; the 200 schema types only the JSON branch.
      const raw: FastifyReply = reply;
      if (format === "csv") {
        const combined = `# workwear tax pack ${pack.label}\n# spend\n${pack.spendCsv}\n# invoices\n${pack.invoicesCsv}`;
        return raw
          .header("content-type", "text/csv; charset=utf-8")
          .header(
            "content-disposition",
            `attachment; filename="workwear-tax-pack-${pack.label.replace(/[^\w.-]+/g, "_")}.csv"`,
          )
          .send(combined);
      }
      if (format === "zip") {
        const zip = buildStoreZip([
          { name: "spend.csv", content: pack.spendCsv },
          { name: "invoices.csv", content: pack.invoicesCsv },
          {
            name: "manifest.json",
            content: JSON.stringify(
              {
                label: pack.label,
                from: pack.from,
                to: pack.to,
                year: pack.year,
                totalSpendMinor: pack.totalSpendMinor,
                spendRowCount: pack.spendRowCount,
                invoiceCount: pack.invoiceCount,
              },
              null,
              2,
            ),
          },
        ]);
        return raw
          .header("content-type", "application/zip")
          .header(
            "content-disposition",
            `attachment; filename="workwear-tax-pack-${pack.label.replace(/[^\w.-]+/g, "_")}.zip"`,
          )
          .send(Buffer.from(zip));
      }

      return {
        from: pack.from,
        to: pack.to,
        label: pack.label,
        year: pack.year,
        totalSpendMinor: pack.totalSpendMinor,
        spendRowCount: pack.spendRowCount,
        invoiceCount: pack.invoiceCount,
        spend: pack.spend,
        invoices: pack.invoices,
        spendCsv: pack.spendCsv,
        invoicesCsv: pack.invoicesCsv,
      };
    },
  );

  // GET /budgets
  app.get(
    "/budgets",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["budgets"],
        response: { 200: BudgetsResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const budgets = await app.deps.repos.listBudgets(userId);
      return { budgets: budgets.map(toBudgetJson) };
    },
  );

  // POST /budgets
  app.post(
    "/budgets",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["budgets"],
        body: CreateBudgetBodySchema,
        response: { 201: z.object({ id: z.string().uuid(), userId: z.string().uuid(), category: z.enum(["APPAREL","FOOTWEAR","ACCESSORIES","BEAUTY","GENERAL"]), period: z.enum(["MONTHLY","QUARTERLY"]), limitMinor: z.number().int().nonnegative(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }), 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { category, period, limitMinor } = request.body as { category: string; period: string; limitMinor: number };
      const budget = await app.deps.repos.createBudget({ userId, category: category as BudgetRecord["category"], period: period as BudgetRecord["period"], limitMinor });
      audit(app.log, "budget.created", { userId, budgetId: budget.id, category, period });
      trackServerEvent("budget_created", { userId, budgetId: budget.id, category, period });
      return reply.code(201).send(toBudgetJson(budget));
    },
  );

  // GET /accountant/cpw-goals — list active cost-per-wear goals (N41)
  app.get(
    "/accountant/cpw-goals",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        response: { 200: CpwGoalsResponseSchema, 401: ErrorSchema, 403: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const metrics = await app.deps.repos.getItemMetrics(userId);
      const goals = [];
      const items = metrics.some((m) => m.targetCpwMinor != null && m.targetCpwMinor > 0)
        ? await wardrobeItemsById(userId)
        : new Map<string, WardrobeItemRecord>();
      for (const m of metrics) {
        if (m.targetCpwMinor == null || m.targetCpwMinor <= 0) continue;
        const item = items.get(m.wardrobeItemId);
        const costMinor = item?.costMinor ?? 0;
        const cpwGoal = cpwGoalProgress(costMinor, m.wearCount, m.targetCpwMinor);
        if (!cpwGoal.active) continue;
        goals.push({
          wardrobeItemId: m.wardrobeItemId,
          brand: item?.brand ?? null,
          category: item?.category ?? "APPAREL",
          costMinor,
          cpwGoal,
        });
      }
      return { goals };
    },
  );

  /** U036 — user CPW threshold prefs + alerts. */
  app.get(
    "/accountant/cpw-threshold",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        response: {
          200: z.object({
            maxCpwMinor: z.number().int().positive().nullable(),
            alerts: z.array(
              z.object({
                wardrobeItemId: z.string().uuid(),
                category: z.string(),
                costPerWearMinor: z.number().int(),
                thresholdMinor: z.number().int(),
                headline: z.string(),
                body: z.string(),
                disposeDeepLink: z.string(),
                wearChallengeDeepLink: z.string(),
              }),
            ),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const prefs = await getCpwThreshold(app.deps.repos, userId);
      const metrics = await app.deps.repos.getItemMetrics(userId);
      const items = metrics.length ? await wardrobeItemsById(userId) : new Map<string, WardrobeItemRecord>();
      const rows = [];
      for (const m of metrics) {
        const item = items.get(m.wardrobeItemId);
        rows.push({
          wardrobeItemId: m.wardrobeItemId,
          category: item?.category ?? "item",
          costPerWearMinor: m.costPerWearMinor,
        });
      }
      const alerts = collectCpwThresholdAlerts(rows, prefs.maxCpwMinor);
      if (alerts.length > 0) {
        trackServerEvent("cpw_threshold_alerted", { userId, count: alerts.length });
      }
      return { maxCpwMinor: prefs.maxCpwMinor, alerts };
    },
  );

  app.put(
    "/accountant/cpw-threshold",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        body: z.object({
          maxCpwMinor: z.number().int().positive().nullable(),
        }),
        response: {
          200: z.object({ maxCpwMinor: z.number().int().positive().nullable() }),
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const body = request.body as { maxCpwMinor: number | null };
      const next = await setCpwThreshold(app.deps.repos, userId, { maxCpwMinor: body.maxCpwMinor });
      audit(app.log, "cpw_threshold.set", { userId, maxCpwMinor: next.maxCpwMinor });
      trackServerEvent("cpw_threshold_updated", { userId });
      return next;
    },
  );

  // POST /accountant/items/:itemId/cpw-goal — set target CPW + progress nudge push
  app.post(
    "/accountant/items/:itemId/cpw-goal",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        params: z.object({ itemId: z.string().uuid() }),
        body: SetCpwGoalBodySchema,
        response: {
          200: SetCpwGoalResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { itemId } = request.params;
      const { targetCpwMinor } = request.body;
      const item = await app.deps.repos.findWardrobeItem(itemId, userId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }

      const metric = await app.deps.repos.setItemCpwGoal({
        userId,
        wardrobeItemId: itemId,
        targetCpwMinor,
      });
      const cpwGoal = cpwGoalProgress(item.costMinor, metric.wearCount, targetCpwMinor);
      const label = item.brand || item.category;
      const nudge = cpwGoalNudgeCopy(cpwGoal, label);

      await app.deps.push.send({
        userId,
        eventType: "CPW_GOAL",
        title: "Cost-per-wear goal",
        body: nudge,
        link: {
          deepLink: `worn://wardrobe?item=${itemId}`,
          screen: "wardrobe",
          wardrobeItemId: itemId,
        },
      });

      audit(app.log, "cpw_goal.set", {
        userId,
        wardrobeItemId: itemId,
        targetCpwMinor,
        wearsNeeded: cpwGoal.wearsNeeded,
      });
      trackServerEvent("cpw_goal_set", {
        userId,
        wardrobeItemId: itemId,
        targetCpwMinor,
        wearsNeeded: cpwGoal.wearsNeeded,
      });

      return {
        wardrobeItemId: itemId,
        targetCpwMinor,
        cpwGoal,
        pushQueued: true,
      };
    },
  );

  // Helper exposure for checkout gating (soft nudge via /prebuy/fit + checkout budgetNudge)
  app.decorate("budgetGating", {
    isBudgetExceeded: (userId: string, category: string) => isBudgetExceeded(app.deps.repos, userId, category),
  });

  // U046 — user-facing reconcile mismatches + fix actions
  app.get(
    "/accountant/reconcile",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL"), requireEntitlement("accountant")],
      schema: {
        tags: ["accountant"],
        querystring: z.object({ fix: z.coerce.boolean().optional() }),
        response: {
          200: z.object({
            checked: z.number().int(),
            mismatched: z.number().int(),
            fixed: z.number().int(),
            mismatches: z.array(
              z.object({
                accountId: z.string().uuid(),
                merchant: z.string(),
                cachedMinor: z.number().int(),
                ledgerSumMinor: z.number().int(),
                lastBalanceAfter: z.number().int().nullable(),
                driftMinor: z.number().int(),
                fixed: z.boolean(),
                investigated: z.boolean(),
                investigatedAt: z.string().datetime().nullable(),
                actions: z.array(
                  z.object({
                    action: z.enum(["recalc", "open_account", "investigate"]),
                    label: z.string(),
                    enabled: z.boolean(),
                  }),
                ),
              }),
            ),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const fix = request.query.fix === true;
      // Only the caller's accounts: never a cross-user scan or fix from here.
      const result = await reconcileMoneyAccounts(app.deps.repos, app.log, { fix, userId });
      const rows = annotateUserMismatches(userId, result.mismatches);
      audit(app.log, "money.read", {
        userId,
        surface: "accountant.reconcile",
        mismatched: rows.length,
        fixed: rows.filter((r) => r.fixed).length,
      });
      return {
        checked: result.checked,
        mismatched: rows.length,
        fixed: rows.filter((r) => r.fixed).length,
        mismatches: rows.map((r) => ({
          accountId: r.accountId,
          merchant: r.merchant,
          cachedMinor: r.cachedMinor,
          ledgerSumMinor: r.ledgerSumMinor,
          lastBalanceAfter: r.lastBalanceAfter,
          driftMinor: r.driftMinor,
          fixed: r.fixed,
          investigated: r.investigated,
          investigatedAt: r.investigatedAt,
          actions: reconcileMismatchActions(r),
        })),
      };
    },
  );

  app.post(
    "/accountant/reconcile/:accountId/recalc",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL"), requireEntitlement("accountant")],
      schema: {
        tags: ["accountant"],
        params: z.object({ accountId: z.string().uuid() }),
        response: {
          200: z.object({
            accountId: z.string().uuid(),
            fixed: z.boolean(),
            cachedMinor: z.number().int().nullable(),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { accountId } = request.params;
      const r = await app.deps.repos.reconcileMoneyAccount(accountId, userId, { fix: true });
      if (!r) {
        return reply.code(404).send({ error: "Not Found", message: "Account not found" });
      }
      if (r.fixed) {
        audit(app.log, "money.reconciled", {
          userId,
          accountId,
          cachedMinor: r.cachedMinor,
          ledgerSumMinor: r.ledgerSumMinor,
        });
      }
      return {
        accountId,
        // Fixed means the cache now equals the ledger sum.
        fixed: r.fixed || r.cachedMinor === r.ledgerSumMinor,
        cachedMinor: r.fixed ? r.ledgerSumMinor : r.cachedMinor,
      };
    },
  );

  app.post(
    "/accountant/reconcile/:accountId/investigate",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL"), requireEntitlement("accountant")],
      schema: {
        tags: ["accountant"],
        params: z.object({ accountId: z.string().uuid() }),
        response: {
          200: z.object({
            accountId: z.string().uuid(),
            investigatedAt: z.string().datetime(),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const accounts = await app.deps.repos.listMoneyAccounts(userId);
      if (!accounts.some((a) => a.id === request.params.accountId)) {
        return reply.code(404).send({ error: "Not Found", message: "Account not found" });
      }
      const marked = markReconcileInvestigated(userId, request.params.accountId);
      audit(app.log, "money.reconcile.investigated", {
        userId,
        accountId: marked.accountId,
      });
      return marked;
    },
  );
};
