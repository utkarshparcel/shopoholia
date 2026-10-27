import {
  AttachReturnLabelBodySchema,
  BookPickupBodySchema,
  ConfirmReturnBodySchema,
  CorrectReturnWindowBodySchema,
  InitiateReturnBodySchema,
  RefundChaseSnoozeBodySchema,
  RefundEtaBoardResponseSchema,
  RequestGstInvoiceBodySchema,
  RequestGstInvoiceResponseSchema,
  ReschedulePickupBodySchema,
  ReturnDetailResponseSchema,
  ReturnsListResponseSchema,
  SizeMapResponseSchema,
  aggregateBrandSizeMap,
  buildGstInvoiceRequestPacket,
  buildRefundEtaBoard,
  gstInvoiceArrivedHref,
  mapLimit,
  merchantReturnUrl,
  refundChaseSnoozeUntil,
  type BookPickupBody,
  type ConfirmReturnBody,
  type CorrectReturnWindowBody,
  type InitiateReturnBody,
  type RefundChaseSnoozeBody,
  type RefundEtaLedgerHint,
  type ReschedulePickupBody,
} from "@worn/shared";
import type { FastifyInstance } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { audit } from "../lib/audit.js";
import { trackServerEvent } from "../lib/analytics.js";
import {
  ReturnStateConflictError,
  isValidReturnTransition,
  returnStatesInto,
  type ReturnState,
} from "../lib/returns/state-machine.js";
import {
  computeWindowDeadline,
  computeExchangeDeadline,
  scheduleReturnDeadlineReminder,
  reconcileRefund,
  enrichDeadlineFromPurchaseItem,
  type ReturnDeadlinePayload,
} from "../lib/return-jobs.js";
import type {
  MerchantPurchaseItemRecord,
  MerchantPurchaseRecord,
  ReturnEventRecord,
  ReturnRecord,
} from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toReturnJson(
  r: ReturnRecord,
  extras?: {
    merchant?: string | null;
    itemTitle?: string | null;
    merchantReturnUrl?: string | null;
    orderRef?: string | null;
    labelImageUrl?: string | null;
  },
) {
  const merchant = extras?.merchant ?? null;
  const invoiceVaultHref = r.invoiceReceiptId
    ? gstInvoiceArrivedHref({
        receiptId: r.invoiceReceiptId,
        merchant,
      })
    : null;
  return {
    id: r.id,
    userId: r.userId,
    purchaseId: r.purchaseId,
    purchaseItemId: r.purchaseItemId,
    windowDeadline: r.windowDeadline.toISOString(),
    exchangeDeadline: r.exchangeDeadline?.toISOString() ?? null,
    state: r.state,
    refundMinor: r.refundMinor,
    method: r.method,
    tracking: r.tracking,
    pickupSlotAt: r.pickupSlotAt?.toISOString() ?? null,
    reason: r.reason ?? null,
    orderedSize: r.orderedSize ?? null,
    preferredSize: r.preferredSize ?? null,
    chaseSnoozeUntil: r.chaseSnoozeUntil?.toISOString() ?? null,
    chaseEscalated: r.chaseEscalated ?? false,
    merchantReturnUrl:
      extras?.merchantReturnUrl !== undefined
        ? extras.merchantReturnUrl
        : merchant
          ? merchantReturnUrl(merchant)
          : null,
    merchant,
    itemTitle: extras?.itemTitle ?? null,
    orderRef: extras?.orderRef ?? null,
    invoiceRequestedAt: r.invoiceRequestedAt?.toISOString() ?? null,
    invoiceReceiptId: r.invoiceReceiptId ?? null,
    invoiceVaultHref,
    labelImageKey: r.labelImageKey ?? null,
    labelImageUrl: extras?.labelImageUrl ?? null,
    labelUsedAt: r.labelUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

type ReturnContext = {
  purchase: MerchantPurchaseRecord | null;
  item: MerchantPurchaseItemRecord | null;
  /** The line title: the return's own line, else the purchase's newest line. */
  itemTitle: string | null;
};

/** Purchases and lines behind many returns in a fixed number of queries (no per-row lookups). */
async function loadReturnContexts(
  app: FastifyInstance,
  userId: string,
  rows: ReturnRecord[],
): Promise<Map<string, ReturnContext>> {
  const repos = app.deps.repos;
  const itemIds = [...new Set(rows.flatMap((r) => (r.purchaseItemId ? [r.purchaseItemId] : [])))];
  const items = await repos.listMerchantPurchaseItemsByIds(userId, itemIds);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const wholeOrderIds = [
    ...new Set(rows.flatMap((r) => (!r.purchaseItemId && r.purchaseId ? [r.purchaseId] : []))),
  ];
  const [purchases, linesByPurchase] = await Promise.all([
    repos.listMerchantPurchasesByIds(userId, [
      ...new Set([...wholeOrderIds, ...items.map((i) => i.purchaseId)]),
    ]),
    repos.listMerchantPurchaseItemsByPurchaseIds(wholeOrderIds),
  ]);
  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  const contexts = new Map<string, ReturnContext>();
  for (const r of rows) {
    if (r.purchaseItemId) {
      const item = itemById.get(r.purchaseItemId) ?? null;
      const purchase = item ? (purchaseById.get(item.purchaseId) ?? null) : null;
      contexts.set(r.id, { purchase, item, itemTitle: item?.title ?? null });
    } else {
      const purchase = r.purchaseId ? (purchaseById.get(r.purchaseId) ?? null) : null;
      const newest = purchase ? linesByPurchase.get(purchase.id)?.[0] : undefined;
      contexts.set(r.id, { purchase, item: null, itemTitle: newest?.title ?? null });
    }
  }
  return contexts;
}

async function enrichReturns(app: FastifyInstance, userId: string, rows: ReturnRecord[]) {
  const contexts = await loadReturnContexts(app, userId, rows);
  // Presign a few labels at a time (C11).
  const labelUrls = await mapLimit(rows, 4, async (r) => {
    if (!r.labelImageKey) return null;
    try {
      return await app.deps.storage.getSignedUrl(r.labelImageKey);
    } catch (err) {
      app.log.warn({ err, returnId: r.id }, "return label presign failed");
      return null;
    }
  });
  return rows.map((r, i) => {
    const ctx = contexts.get(r.id);
    const merchant = ctx?.purchase?.merchant ?? null;
    return toReturnJson(r, {
      merchant,
      itemTitle: ctx?.itemTitle ?? null,
      orderRef: ctx?.purchase?.orderRef ?? null,
      merchantReturnUrl: merchant ? merchantReturnUrl(merchant) : null,
      labelImageUrl: labelUrls[i] ?? null,
    });
  });
}

async function enrichReturn(app: FastifyInstance, r: ReturnRecord) {
  const [json] = await enrichReturns(app, r.userId, [r]);
  return json!;
}

type GuardedResult =
  | { ok: true; row: ReturnRecord }
  | { ok: false; status: 404 | 409; body: { error: string; message: string } };

/**
 * Owner-scoped update under the row lock. `fromStates` is checked on the locked row, so a state
 * that moved since the caller's read (another tap, the deadline job, expiry) is a 409, not an
 * overwrite.
 */
async function guardedUpdate(
  app: FastifyInstance,
  id: string,
  userId: string,
  patch: Parameters<FastifyInstance["deps"]["repos"]["updateReturnRequest"]>[1],
  fromStates?: readonly ReturnState[],
  opts: { actor?: string; noteActor?: string } = {},
): Promise<GuardedResult> {
  try {
    const row = await app.deps.repos.updateReturnRequest(id, patch, { userId, fromStates, ...opts });
    if (!row) return { ok: false, status: 404, body: { error: "Not Found", message: "Return not found" } };
    return { ok: true, row };
  } catch (err) {
    if (!(err instanceof ReturnStateConflictError)) throw err;
    return {
      ok: false,
      status: 409,
      body: {
        error: "Conflict",
        message: patch.state ? `Cannot transition ${err.state} -> ${patch.state}` : `Return is ${err.state}`,
      },
    };
  }
}

/** Past its window: expire it (if still expirable) and answer 409. */
async function expireNow(app: FastifyInstance, id: string, userId: string) {
  await guardedUpdate(app, id, userId, { state: "EXPIRED" }, returnStatesInto("EXPIRED"), {
    actor: "system.expire",
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "23505";
}

type MoneyAccountDraft = Parameters<FastifyInstance["deps"]["repos"]["createMoneyAccountWithEntry"]>[0]["account"];

/**
 * reconcileRefund's repos. A refund account it needs to create is held back and created together
 * with the refund entry, so a failed post never leaves an empty account behind.
 */
function refundRepos(app: FastifyInstance) {
  const repos = app.deps.repos;
  const drafts = new Map<string, MoneyAccountDraft>();
  return {
    listMoneyAccounts: (userId: string) => repos.listMoneyAccounts(userId),
    createMoneyAccount: async (input: MoneyAccountDraft & { balanceCacheMinor: number }) => {
      const id = `draft:${drafts.size}`;
      const { balanceCacheMinor: _opening, ...account } = input;
      drafts.set(id, account);
      return { id };
    },
    postMoneyLedger: async (input: Parameters<typeof repos.postMoneyLedger>[0]) => {
      const draft = drafts.get(input.accountId);
      if (!draft) return repos.postMoneyLedger(input);
      const { account } = await repos.createMoneyAccountWithEntry({
        account: draft,
        entry: { delta: input.delta, type: input.type, refType: input.refType, refId: input.refId },
      });
      return { balanceAfter: account.balanceCacheMinor };
    },
  };
}

async function scheduleDeadlineWithImage(
  app: FastifyInstance,
  base: Omit<ReturnDeadlinePayload, "imageUrl" | "amountMinor" | "currency"> & {
    purchaseItemId?: string | null;
    currency?: string | null;
  },
): Promise<void> {
  let item: { imageKey: string | null; priceMinor: number } | null = null;
  if (base.purchaseItemId) {
    try {
      item = await app.deps.repos.findMerchantPurchaseItemById(base.purchaseItemId);
    } catch {
      item = null;
    }
  }
  const payload = await enrichDeadlineFromPurchaseItem(
    {
      returnId: base.returnId,
      userId: base.userId,
      windowDeadline: base.windowDeadline,
      merchant: base.merchant,
    },
    item,
    (key) => app.deps.storage.getSignedUrl(key),
    base.currency,
  );
  await scheduleReturnDeadlineReminder(payload);
}

function toEventJson(e: ReturnEventRecord) {
  return {
    id: e.id,
    returnRequestId: e.returnRequestId,
    fromState: e.fromState,
    toState: e.toState,
    actor: e.actor,
    createdAt: e.createdAt.toISOString(),
  };
}

const ReturnJsonSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  purchaseId: z.string().uuid().nullable(),
  purchaseItemId: z.string().uuid().nullable(),
  windowDeadline: z.string().datetime(),
  exchangeDeadline: z.string().datetime().nullable().optional(),
  state: z.string(),
  refundMinor: z.number().int().nullable(),
  method: z.string().nullable(),
  tracking: z.string().nullable(),
  pickupSlotAt: z.string().datetime().nullable().optional(),
  reason: z
    .enum([
      "TOO_SMALL",
      "TOO_BIG",
      "SIZE_TOO_SMALL",
      "SIZE_TOO_BIG",
      "WRONG_ITEM",
      "QUALITY",
      "OTHER",
    ])
    .nullable()
    .optional(),
  orderedSize: z.string().nullable().optional(),
  preferredSize: z.string().nullable().optional(),
  chaseSnoozeUntil: z.string().datetime().nullable().optional(),
  chaseEscalated: z.boolean().optional(),
  merchantReturnUrl: z.string().url().nullable().optional(),
  merchant: z.string().nullable().optional(),
  itemTitle: z.string().nullable().optional(),
  orderRef: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const returnsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /returns - list user's return requests
  app.get(
    "/returns",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        response: { 200: ReturnsListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      // Expire any past-deadline that are not terminal: one locked, set-based write.
      await app.deps.repos.expireOverdueReturnRequests(userId, new Date());
      const returns = await app.deps.repos.listReturnRequests(userId);
      return { returns: await enrichReturns(app, userId, returns) };
    },
  );

  // GET /returns/refund-eta — N16 board: INITIATED→…→REFUNDED with ETA until ledger credit
  app.get(
    "/returns/refund-eta",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        querystring: z.object({
          all: z.enum(["0", "1"]).optional(),
        }),
        response: { 200: RefundEtaBoardResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const all = request.query.all === "1";
      const returns = await app.deps.repos.listReturnRequests(userId);
      const enriched = await enrichReturns(app, userId, returns);

      const boardStates = new Set(["INITIATED", "PICKUP_SCHEDULED", "CONFIRMED", "REFUNDED"]);
      const entries = await app.deps.repos.listMoneyLedgerByRefs(
        userId,
        enriched.filter((r) => boardStates.has(r.state)).map((r) => r.id),
        "REFUND",
      );
      const ledgerByReturnId = new Map<string, RefundEtaLedgerHint>();
      for (const entry of entries) {
        if (!entry.refId || ledgerByReturnId.has(entry.refId)) continue;
        ledgerByReturnId.set(entry.refId, { amountMinor: entry.delta, creditedAt: entry.createdAt });
      }

      const board = buildRefundEtaBoard(
        enriched.map((r) => ({
          id: r.id,
          state: r.state,
          refundMinor: r.refundMinor,
          merchant: r.merchant,
          itemTitle: r.itemTitle,
          tracking: r.tracking,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
        })),
        ledgerByReturnId,
        { all },
      );

      return { board };
    },
  );

  // GET /returns/size-map — N17 per-brand size inconsistency from returns
  app.get(
    "/returns/size-map",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        response: { 200: SizeMapResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const returns = (await app.deps.repos.listReturnRequests(userId)).filter((r) => r.reason);
      const contexts = await loadReturnContexts(app, userId, returns);
      const entries = [];
      for (const r of returns) {
        if (!r.reason) continue;
        const ctx = contexts.get(r.id);
        entries.push({
          returnId: r.id,
          brand: ctx?.item?.brand ?? null,
          merchant: ctx?.purchase?.merchant ?? null,
          itemTitle: ctx?.item?.title ?? null,
          category: ctx?.item?.category ?? null,
          orderedSize: r.orderedSize,
          preferredSize: r.preferredSize,
          reason: r.reason,
          returnedAt: r.createdAt,
        });
      }
      const brands = aggregateBrandSizeMap(entries);
      trackServerEvent("size_map_viewed", { userId, brandCount: brands.length });
      return { brands };
    },
  );

  // GET /returns/:id
  app.get(
    "/returns/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: ReturnDetailResponseSchema, 404: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const req_ = await app.deps.repos.findReturnRequest(id, userId);
      if (!req_) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      const events = await app.deps.repos.listReturnEvents(id);
      return { request: await enrichReturn(app, req_), events: events.map(toEventJson) };
    },
  );

  // POST /returns - create return request (alias for initiate without purchase lookup)
  app.post(
    "/returns",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        body: InitiateReturnBodySchema,
        response: {
          /** A repeat for a line that already has an open return: that return, unchanged. */
          200: ReturnJsonSchema,
          201: ReturnJsonSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { purchaseId, purchaseItemId, method, reason, orderedSize, preferredSize } =
        request.body as InitiateReturnBody;
      if (!purchaseId && !purchaseItemId) {
        return reply.code(400).send({ error: "Bad Request", message: "purchaseId or purchaseItemId required" });
      }
      let merchant = "Unknown";
      let purchasedAt = new Date();
      let currency: string | null = "INR";
      let resolvedPurchaseId: string | null = purchaseId ?? null;
      const resolvedItemId: string | null = purchaseItemId ?? null;
      let itemTitle: string | null = null;
      let orderRef: string | null = null;

      // Only the caller's own purchases: the lookups by id are not user-scoped.
      if (purchaseItemId) {
        const item = await app.deps.repos.findMerchantPurchaseItemById(purchaseItemId);
        const purchase = item ? await app.deps.repos.findMerchantPurchaseById(item.purchaseId) : null;
        if (!item || !purchase || purchase.userId !== userId) {
          return reply.code(400).send({ error: "Bad Request", message: "Purchase item not found" });
        }
        merchant = purchase.merchant;
        purchasedAt = purchase.purchasedAt;
        currency = purchase.currency;
        resolvedPurchaseId = purchase.id;
        itemTitle = item.title;
        orderRef = purchase.orderRef;
      } else if (purchaseId) {
        const purchase = await app.deps.repos.findMerchantPurchaseById(purchaseId);
        if (!purchase || purchase.userId !== userId) {
          return reply.code(400).send({ error: "Bad Request", message: "Purchase not found" });
        }
        merchant = purchase.merchant;
        purchasedAt = purchase.purchasedAt;
        currency = purchase.currency;
        orderRef = purchase.orderRef;
      }

      const windowDeadline = computeWindowDeadline(purchasedAt, merchant);
      const exchangeDeadline = computeExchangeDeadline(purchasedAt, merchant);
      // One open return per line (#61): a double tap or retry gets the open one back.
      const { request: created, created: isNew } = await app.deps.repos.openReturnRequest({
        userId,
        purchaseId: resolvedPurchaseId,
        purchaseItemId: resolvedItemId,
        windowDeadline,
        exchangeDeadline,
        method: method ?? null,
        reason: reason ?? null,
        orderedSize: orderedSize ?? null,
        preferredSize: preferredSize ?? null,
      });
      if (!isNew) return reply.code(200).send(await enrichReturn(app, created));
      await scheduleDeadlineWithImage(app, {
        returnId: created.id,
        userId,
        windowDeadline: windowDeadline.toISOString(),
        merchant,
        purchaseItemId: resolvedItemId,
        currency,
      });
      audit(app.log, "return.created", { userId, returnId: created.id, merchant });
      trackServerEvent("return_initiated", { userId, returnId: created.id });
      return reply.code(201).send(toReturnJson(created, { merchant, itemTitle, orderRef }));
    },
  );

  // POST /returns/:id/initiate - transition REQUESTED -> INITIATED, or create if :id is a purchaseItemId
  app.post(
    "/returns/:id/initiate",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: InitiateReturnBodySchema.optional(),
        response: {
          200: ReturnJsonSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = (request.body ?? {}) as Partial<InitiateReturnBody>;

      // First try as existing return id -> state transition
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (existing) {
        const moved = await guardedUpdate(
          app,
          id,
          userId,
          { state: "INITIATED", method: body.method ?? existing.method },
          returnStatesInto("INITIATED"),
        );
        if (!moved.ok) return reply.code(moved.status).send(moved.body);
        const updated = moved.row;
        const purchase = existing.purchaseId
          ? await app.deps.repos.findMerchantPurchaseById(existing.purchaseId)
          : null;
        const merchant = purchase?.merchant ?? "Unknown";
        await scheduleDeadlineWithImage(app, {
          returnId: id,
          userId,
          windowDeadline: updated.windowDeadline.toISOString(),
          merchant,
          purchaseItemId: existing.purchaseItemId,
          currency: purchase?.currency ?? null,
        });
        audit(app.log, "return.initiated", { userId, returnId: id });
        trackServerEvent("return_initiated", { userId, returnId: id });
        return reply.code(200).send(toReturnJson(updated, { merchant }));
      }

      // Otherwise treat :id as purchaseItemId or purchaseId to create
      let merchant = "Unknown";
      let purchasedAt = new Date();
      let currency: string | null = "INR";
      let resolvedPurchaseId: string | null = body.purchaseId ?? null;
      let resolvedItemId: string | null = body.purchaseItemId ?? id;

      const item = await app.deps.repos.findMerchantPurchaseItemById(id);
      if (item) {
        const purchase = await app.deps.repos.findMerchantPurchaseById(item.purchaseId);
        if (!purchase || purchase.userId !== userId) {
          return reply.code(404).send({ error: "Not Found", message: "Return or purchase not found" });
        }
        merchant = purchase.merchant;
        purchasedAt = purchase.purchasedAt;
        currency = purchase.currency;
        resolvedPurchaseId = purchase.id;
        resolvedItemId = item.id;
      } else {
        const purchase = await app.deps.repos.findMerchantPurchaseById(id);
        if (!purchase || purchase.userId !== userId) {
          return reply.code(404).send({ error: "Not Found", message: "Return or purchase not found" });
        }
        merchant = purchase.merchant;
        purchasedAt = purchase.purchasedAt;
        currency = purchase.currency;
        resolvedPurchaseId = purchase.id;
        resolvedItemId = null;
      }

      const windowDeadline = computeWindowDeadline(purchasedAt, merchant);
      const exchangeDeadline = computeExchangeDeadline(purchasedAt, merchant);
      // Created straight into INITIATED in one transaction (no REQUESTED row left behind on a crash).
      const opened = await app.deps.repos.openReturnRequest({
        userId,
        purchaseId: resolvedPurchaseId,
        purchaseItemId: resolvedItemId,
        windowDeadline,
        exchangeDeadline,
        method: body.method ?? null,
        reason: body.reason ?? null,
        orderedSize: body.orderedSize ?? null,
        preferredSize: body.preferredSize ?? null,
        state: "INITIATED",
      });
      const created = opened.request;
      if (!opened.created) {
        // The line already has an open return: a retry. Move a REQUESTED one on; return any other as is.
        if (created.state !== "REQUESTED") return reply.code(200).send(toReturnJson(created, { merchant }));
        const moved = await guardedUpdate(app, created.id, userId, { state: "INITIATED" }, ["REQUESTED"]);
        if (!moved.ok) return reply.code(moved.status).send(moved.body);
        return reply.code(200).send(toReturnJson(moved.row, { merchant }));
      }
      const initiated = created;
      await scheduleDeadlineWithImage(app, {
        returnId: created.id,
        userId,
        windowDeadline: windowDeadline.toISOString(),
        merchant,
        purchaseItemId: resolvedItemId,
        currency,
      });
      audit(app.log, "return.initiated", { userId, returnId: created.id, merchant });
      trackServerEvent("return_initiated", { userId, returnId: created.id });
      return reply.code(200).send(toReturnJson(initiated!, { merchant }));
    },
  );

  // POST /returns/:id/pickup — INITIATED → PICKUP_SCHEDULED (WV01-PICKUP-BOOK)
  app.post(
    "/returns/:id/pickup",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: BookPickupBodySchema,
        response: {
          200: ReturnJsonSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as BookPickupBody;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      if (!isValidReturnTransition(existing.state as ReturnState, "PICKUP_SCHEDULED")) {
        return reply
          .code(409)
          .send({ error: "Conflict", message: `Cannot transition ${existing.state} -> PICKUP_SCHEDULED` });
      }
      if (new Date() > existing.windowDeadline) {
        await expireNow(app, id, userId);
        return reply.code(409).send({ error: "Conflict", message: "Return window expired" });
      }
      const slot = new Date(body.pickupSlotAt);
      if (Number.isNaN(slot.getTime())) {
        return reply.code(409).send({ error: "Conflict", message: "Invalid pickupSlotAt" });
      }
      const moved = await guardedUpdate(
        app,
        id,
        userId,
        { state: "PICKUP_SCHEDULED", pickupSlotAt: slot },
        returnStatesInto("PICKUP_SCHEDULED"),
      );
      if (!moved.ok) return reply.code(moved.status).send(moved.body);
      const updated = moved.row;
      const purchase = existing.purchaseId
        ? await app.deps.repos.findMerchantPurchaseById(existing.purchaseId)
        : null;
      audit(app.log, "return.pickup_scheduled", {
        userId,
        returnId: id,
        pickupSlotAt: slot.toISOString(),
      });
      trackServerEvent("return_pickup_scheduled", { userId, returnId: id });
      return reply.code(200).send(
        toReturnJson(updated!, { merchant: purchase?.merchant ?? null }),
      );
    },
  );

  // POST /returns/:id/pickup/reschedule — U019 stay PICKUP_SCHEDULED with new slot
  app.post(
    "/returns/:id/pickup/reschedule",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: ReschedulePickupBodySchema,
        response: {
          200: ReturnJsonSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as ReschedulePickupBody;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      if (existing.state !== "PICKUP_SCHEDULED") {
        return reply.code(409).send({
          error: "Conflict",
          message: `Reschedule only from PICKUP_SCHEDULED (got ${existing.state})`,
        });
      }
      const slot = new Date(body.pickupSlotAt);
      if (Number.isNaN(slot.getTime())) {
        return reply.code(409).send({ error: "Conflict", message: "Invalid pickupSlotAt" });
      }
      // Slot and its audit event in one transaction, only while the pickup is still booked.
      const moved = await guardedUpdate(app, id, userId, { pickupSlotAt: slot }, ["PICKUP_SCHEDULED"], {
        noteActor: "user.reschedule",
      });
      if (!moved.ok) return reply.code(moved.status).send(moved.body);
      const updated = moved.row;
      audit(app.log, "return.pickup_rescheduled", {
        userId,
        returnId: id,
        pickupSlotAt: slot.toISOString(),
      });
      trackServerEvent("return_pickup_rescheduled", { userId, returnId: id });
      return reply.code(200).send(await enrichReturn(app, updated!));
    },
  );

  // POST /returns/:id/pickup/cancel — U019 back to INITIATED
  app.post(
    "/returns/:id/pickup/cancel",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: ReturnJsonSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      if (!isValidReturnTransition(existing.state as ReturnState, "INITIATED")) {
        return reply.code(409).send({
          error: "Conflict",
          message: `Cannot cancel pickup from ${existing.state}`,
        });
      }
      const moved = await guardedUpdate(
        app,
        id,
        userId,
        { state: "INITIATED", pickupSlotAt: null },
        returnStatesInto("INITIATED"),
      );
      if (!moved.ok) return reply.code(moved.status).send(moved.body);
      const updated = moved.row;
      audit(app.log, "return.pickup_cancelled", { userId, returnId: id });
      trackServerEvent("return_pickup_cancelled", { userId, returnId: id });
      return reply.code(200).send(await enrichReturn(app, updated!));
    },
  );

  // POST /returns/:id/chase/snooze — U020
  app.post(
    "/returns/:id/chase/snooze",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: RefundChaseSnoozeBodySchema.optional(),
        response: {
          200: ReturnJsonSchema,
          404: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = (request.body ?? {}) as RefundChaseSnoozeBody;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      const until = refundChaseSnoozeUntil(new Date(), body.days ?? 3);
      const updated = await app.deps.repos.updateReturnRequest(id, { chaseSnoozeUntil: until }, { userId });
      if (!updated) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      audit(app.log, "return.chase_snoozed", {
        userId,
        returnId: id,
        chaseSnoozeUntil: until.toISOString(),
      });
      trackServerEvent("return_chase_snoozed", { userId, returnId: id });
      return reply.code(200).send(await enrichReturn(app, updated!));
    },
  );

  // POST /returns/:id/chase/escalate — U020
  app.post(
    "/returns/:id/chase/escalate",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: ReturnJsonSchema,
          404: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      const updated = await app.deps.repos.updateReturnRequest(id, { chaseEscalated: true }, { userId });
      if (!updated) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      audit(app.log, "return.chase_escalated", { userId, returnId: id });
      trackServerEvent("return_chase_escalated", { userId, returnId: id });
      return reply.code(200).send(await enrichReturn(app, updated!));
    },
  );

  // POST /returns/:id/window — U025 user-correctable window with audit + push reschedule
  app.post(
    "/returns/:id/window",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: CorrectReturnWindowBodySchema,
        response: {
          200: ReturnJsonSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as CorrectReturnWindowBody;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      const nextDeadline = new Date(body.windowDeadline);
      if (Number.isNaN(nextDeadline.getTime())) {
        return reply.code(400).send({ error: "Bad Request", message: "Invalid windowDeadline" });
      }
      // Deadline and its audit event in one transaction.
      const updated = await app.deps.repos.updateReturnRequest(
        id,
        { windowDeadline: nextDeadline },
        { userId, noteActor: "return.window.corrected" },
      );
      if (!updated) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      const purchase = existing.purchaseId
        ? await app.deps.repos.findMerchantPurchaseById(existing.purchaseId)
        : null;
      await scheduleDeadlineWithImage(app, {
        returnId: id,
        userId,
        windowDeadline: nextDeadline.toISOString(),
        merchant: purchase?.merchant ?? "Unknown",
        purchaseItemId: existing.purchaseItemId,
        currency: purchase?.currency ?? null,
      });
      audit(app.log, "return.window.corrected", {
        userId,
        returnId: id,
        windowDeadline: nextDeadline.toISOString(),
        reason: body.reason,
        previousWindowDeadline: existing.windowDeadline.toISOString(),
      });
      trackServerEvent("return_window_corrected", { userId, returnId: id });
      return reply.code(200).send(await enrichReturn(app, updated!));
    },
  );

  // POST /returns/:id/confirm - INITIATED|PICKUP_SCHEDULED -> CONFIRMED
  app.post(
    "/returns/:id/confirm",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: ConfirmReturnBodySchema.optional(),
        response: {
          200: ReturnJsonSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = (request.body ?? {}) as Partial<ConfirmReturnBody>;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      if (!isValidReturnTransition(existing.state as ReturnState, "CONFIRMED")) {
        return reply.code(409).send({ error: "Conflict", message: `Cannot transition ${existing.state} -> CONFIRMED` });
      }
      if (new Date() > existing.windowDeadline) {
        await expireNow(app, id, userId);
        return reply.code(409).send({ error: "Conflict", message: "Return window expired" });
      }
      const moved = await guardedUpdate(
        app,
        id,
        userId,
        { state: "CONFIRMED", tracking: body.tracking ?? null },
        returnStatesInto("CONFIRMED"),
      );
      if (!moved.ok) return reply.code(moved.status).send(moved.body);
      audit(app.log, "return.confirmed", { userId, returnId: id });
      trackServerEvent("return_confirmed", { userId, returnId: id });
      return reply.code(200).send(toReturnJson(moved.row));
    },
  );

  // POST /returns/:id/refund - CONFIRMED -> REFUNDED (stub reconciliation to money_ledger)
  app.post(
    "/returns/:id/refund",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          refundMinor: z.number().int().positive().optional(),
          /** U012 — required tender destination for ledger metadata. */
          destination: z.enum(["ORIGINAL_CARD", "STORE_CREDIT", "UPI"]),
        }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            state: z.string(),
            refundMinor: z.number().int().nullable(),
            destination: z.enum(["ORIGINAL_CARD", "STORE_CREDIT", "UPI"]),
          }),
          400: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as {
        refundMinor?: number;
        destination: "ORIGINAL_CARD" | "STORE_CREDIT" | "UPI";
      };
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      const replay = (row: ReturnRecord) =>
        reply.code(200).send({
          id: row.id,
          state: row.state,
          refundMinor: row.refundMinor,
          destination: body.destination,
        });
      // A retry after the refund landed: the same answer, no second credit.
      if (existing.state === "REFUNDED") return replay(existing);
      if (!isValidReturnTransition(existing.state as ReturnState, "REFUNDED")) {
        return reply.code(409).send({ error: "Conflict", message: `Cannot transition ${existing.state} -> REFUNDED` });
      }
      let refundMinor = body.refundMinor ?? 0;
      let merchant: string | null = null;
      if (existing.purchaseItemId) {
        const item = await app.deps.repos.findMerchantPurchaseItemById(existing.purchaseItemId);
        if (!refundMinor) refundMinor = item?.priceMinor ?? 0;
        if (item?.purchaseId) {
          const p = await app.deps.repos.findMerchantPurchaseById(item.purchaseId);
          merchant = p?.merchant ?? null;
        }
      } else if (existing.purchaseId) {
        const p = await app.deps.repos.findMerchantPurchaseById(existing.purchaseId);
        if (!refundMinor) refundMinor = p?.totalMinor ?? 0;
        merchant = p?.merchant ?? null;
      }
      // The credit is keyed on the return id (unique per user, ref and type), so a concurrent or
      // retried refund posts it once; the ledger row is the amount of record.
      const prior = await app.deps.repos.findMoneyLedgerByRef(userId, id, "REFUND");
      if (!prior) {
        try {
          await reconcileRefund(refundRepos(app), userId, id, refundMinor, merchant, body.destination);
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
      const posted = prior ?? (await app.deps.repos.findMoneyLedgerByRef(userId, id, "REFUND"));
      if (posted) refundMinor = posted.delta;
      const moved = await guardedUpdate(app, id, userId, { state: "REFUNDED", refundMinor }, ["CONFIRMED"]);
      if (!moved.ok) {
        const now = moved.status === 409 ? await app.deps.repos.findReturnRequest(id, userId) : null;
        if (now?.state === "REFUNDED") return replay(now);
        return reply.code(moved.status).send(moved.body);
      }
      trackServerEvent("return_refunded", {
        userId,
        returnId: id,
        refundMinor,
        destination: body.destination,
      });
      return replay(moved.row);
    },
  );

  // POST /returns/:id/request-invoice — U026 GST invoice request
  app.post(
    "/returns/:id/request-invoice",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: RequestGstInvoiceBodySchema,
        response: {
          200: RequestGstInvoiceResponseSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      }

      let merchant = "Merchant";
      let orderRef: string | null = null;
      let purchasedAt: Date | null = null;
      let itemTitle: string | null = null;
      let totalMinor: number | null = null;
      let currency: string | null = null;

      if (existing.purchaseItemId) {
        const item = await app.deps.repos.findMerchantPurchaseItemById(existing.purchaseItemId);
        itemTitle = item?.title ?? null;
        totalMinor = item?.priceMinor ?? null;
        if (item) {
          const p = await app.deps.repos.findMerchantPurchaseById(item.purchaseId);
          merchant = p?.merchant ?? merchant;
          orderRef = p?.orderRef ?? null;
          purchasedAt = p?.purchasedAt ?? null;
          currency = p?.currency ?? null;
        }
      } else if (existing.purchaseId) {
        const p = await app.deps.repos.findMerchantPurchaseById(existing.purchaseId);
        merchant = p?.merchant ?? merchant;
        orderRef = p?.orderRef ?? null;
        purchasedAt = p?.purchasedAt ?? null;
        totalMinor = p?.totalMinor ?? null;
        currency = p?.currency ?? null;
      }

      const packet = buildGstInvoiceRequestPacket({
        merchant,
        orderRef,
        purchasedAt,
        itemTitle,
        totalMinor,
        currency,
        contactOverride: request.body.contactOverride,
      });
      const invoiceRequestedAt = existing.invoiceRequestedAt ?? new Date();

      // If a vault receipt already matches this merchant, link it for "when arrives".
      let invoiceReceiptId = existing.invoiceReceiptId;
      if (!invoiceReceiptId) {
        const receipts = await app.deps.repos.listReceipts(userId);
        const match = receipts.find(
          (r) =>
            r.merchant.trim().toLowerCase() === merchant.trim().toLowerCase() &&
            (existing.purchaseId == null || r.purchaseId === existing.purchaseId),
        );
        if (match) invoiceReceiptId = match.id;
      }

      const updated =
        (await app.deps.repos.updateReturnRequest(
          id,
          { invoiceRequestedAt, ...(invoiceReceiptId ? { invoiceReceiptId } : {}) },
          { userId },
        )) ?? existing;

      audit(app.log, "invoice.requested", {
        userId,
        returnId: id,
        merchant,
      });
      trackServerEvent("gst_invoice_requested", { userId, returnId: id, merchant });

      return reply.code(200).send({
        request: await enrichReturn(app, updated),
        packet,
        invoiceRequestedAt: invoiceRequestedAt.toISOString(),
      });
    },
  );

  // POST /returns/:id/label — U029 attach seller return label
  app.post(
    "/returns/:id/label",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        body: AttachReturnLabelBodySchema,
        response: {
          200: ReturnDetailResponseSchema.shape.request,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      }
      const updated = await app.deps.repos.updateReturnRequest(
        id,
        { labelImageKey: request.body.imageKey, labelUsedAt: null },
        { userId },
      );
      if (!updated) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      trackServerEvent("return_label_uploaded", { userId, returnId: id });
      return reply.code(200).send(await enrichReturn(app, updated!));
    },
  );

  // POST /returns/:id/label/used — U029 mark label used by pickup agent
  app.post(
    "/returns/:id/label/used",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["returns"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: ReturnDetailResponseSchema.shape.request,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findReturnRequest(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      }
      if (!existing.labelImageKey) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "No return label uploaded" });
      }
      const updated = await app.deps.repos.updateReturnRequest(id, { labelUsedAt: new Date() }, { userId });
      if (!updated) return reply.code(404).send({ error: "Not Found", message: "Return not found" });
      trackServerEvent("return_label_used", { userId, returnId: id });
      return reply.code(200).send(await enrichReturn(app, updated!));
    },
  );
};
