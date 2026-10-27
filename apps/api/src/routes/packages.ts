import {
  AssignPackageBodySchema,
  AttachDeliveryProofBodySchema,
  BrokenItemRouterResponseSchema,
  MarkDeliveredBodySchema,
  PackagesListResponseSchema,
  RtoAddressFixBodySchema,
  RtoRecoveryBoardResponseSchema,
  RtoStartRefundBodySchema,
  UpdatePackageBodySchema,
  type PackageDeliveryStatus,
  buildPurchaseCoolingOff,
  buildRtoRecoveryBoard,
  buildRtoRecoveryRow,
  canAssignPackage,
  computeExchangeWindowDeadline,
  computeReturnWindowDeadline,
  defaultEtaForStatus,
  packageAssignedPushCopy,
  routeBrokenItem,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { audit } from "../lib/audit.js";
import {
  IN_TRANSIT_STATUSES,
  isValidPackageTransition,
} from "../lib/packages/state-machine.js";
import { ReturnStateConflictError } from "../lib/returns/state-machine.js";
import {
  computeWindowDeadline,
  computeExchangeDeadline,
  scheduleReturnDeadlineReminder,
} from "../lib/return-jobs.js";
import type { MerchantPurchaseRecord, ReturnRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toPackageJson(
  p: MerchantPurchaseRecord,
  itemTitles: string[] = [],
  extras?: { assigneeLabel?: string | null },
) {
  const suggestWardrobeAdd = p.deliveryStatus === "DELIVERED";
  const coolingOff = buildPurchaseCoolingOff({
    merchant: p.merchant,
    purchasedAt: p.purchasedAt,
    deliveryStatus: p.deliveryStatus,
  });
  return {
    id: p.id,
    merchant: p.merchant,
    orderRef: p.orderRef,
    purchasedAt: p.purchasedAt.toISOString(),
    currency: p.currency,
    totalMinor: p.totalMinor,
    deliveryStatus: p.deliveryStatus,
    etaAt: p.etaAt?.toISOString() ?? null,
    trackingCode: p.trackingCode,
    carrier: p.carrier ?? null,
    deliveredAt: p.deliveredAt?.toISOString() ?? null,
    returnWindowDeadline: p.returnWindowDeadline?.toISOString() ?? null,
    exchangeWindowDeadline: p.exchangeWindowDeadline?.toISOString() ?? null,
    deliveryAddressNote: p.deliveryAddressNote ?? null,
    deliveryProofKeys: p.deliveryProofKeys ?? [],
    itemTitles,
    suggestWardrobeAdd,
    coolingOff,
    assigneeUserId: p.assigneeUserId ?? null,
    assigneeLabel: extras?.assigneeLabel ?? null,
  };
}

export const packagesRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /packages/rto-recovery — N15 board: FAILED → checklist + refund track
  app.get(
    "/packages/rto-recovery",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        querystring: z.object({
          all: z.enum(["0", "1"]).optional(),
        }),
        response: { 200: RtoRecoveryBoardResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const all = request.query.all === "1";
      const purchases = await app.deps.repos.listMerchantPurchases(userId);
      const returns = await app.deps.repos.listReturnRequests(userId);

      const returnsByPurchaseId = new Map<
        string,
        {
          id: string;
          state: ReturnRecord["state"];
          refundMinor: number | null;
          tracking: string | null;
          merchant: string | null;
          itemTitle: string | null;
          updatedAt: Date;
          createdAt: Date;
        }
      >();
      // Latest return per purchase first, then its line titles and refunds in one query each.
      const latestByPurchaseId = new Map<string, ReturnRecord>();
      for (const r of returns) {
        if (!r.purchaseId) continue;
        const existing = latestByPurchaseId.get(r.purchaseId);
        if (!existing || r.updatedAt > existing.updatedAt) latestByPurchaseId.set(r.purchaseId, r);
      }
      const latest = [...latestByPurchaseId.values()];
      const [items, entries] = await Promise.all([
        app.deps.repos.listMerchantPurchaseItemsByIds(
          userId,
          latest.flatMap((r) => (r.purchaseItemId ? [r.purchaseItemId] : [])),
        ),
        app.deps.repos.listMoneyLedgerByRefs(
          userId,
          latest.map((r) => r.id),
          "REFUND",
        ),
      ]);
      const titleByItemId = new Map(items.map((i) => [i.id, i.title]));
      for (const [purchaseId, r] of latestByPurchaseId) {
        returnsByPurchaseId.set(purchaseId, {
          id: r.id,
          state: r.state,
          refundMinor: r.refundMinor,
          tracking: r.tracking,
          merchant: null,
          itemTitle: r.purchaseItemId ? (titleByItemId.get(r.purchaseItemId) ?? null) : null,
          updatedAt: r.updatedAt,
          createdAt: r.createdAt,
        });
      }

      const ledgerByReturnId = new Map<string, { amountMinor: number; creditedAt: Date }>();
      for (const entry of entries) {
        if (!entry.refId || ledgerByReturnId.has(entry.refId)) continue;
        ledgerByReturnId.set(entry.refId, { amountMinor: entry.delta, creditedAt: entry.createdAt });
      }
      const purchaseById = new Map(purchases.map((p) => [p.id, p]));

      const board = buildRtoRecoveryBoard(
        purchases.map((p) => ({
          purchaseId: p.id,
          merchant: p.merchant,
          orderRef: p.orderRef,
          totalMinor: p.totalMinor,
          currency: p.currency,
          deliveryStatus: p.deliveryStatus,
          trackingCode: p.trackingCode,
          updatedAt: p.updatedAt,
          failedAt: p.deliveryStatus === "FAILED" ? p.updatedAt : null,
        })),
        returnsByPurchaseId,
        ledgerByReturnId,
        { all },
      ).map((row) => {
        const p = purchaseById.get(row.purchaseId);
        return {
          ...row,
          deliveryAddressNote: p?.deliveryAddressNote ?? null,
          deliveryProofKeys: p?.deliveryProofKeys ?? [],
        };
      });

      trackServerEvent("rto_recovery_viewed", { userId, count: board.length });
      return { board };
    },
  );

  // POST /packages/:id/rto/start-refund — open refund claim for FAILED delivery
  app.post(
    "/packages/:id/rto/start-refund",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        params: z.object({ id: z.string().uuid() }),
        body: RtoStartRefundBodySchema,
        response: {
          200: RtoRecoveryBoardResponseSchema.shape.board.element,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findMerchantPurchaseById(id);
      if (!existing || existing.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }
      if (existing.deliveryStatus !== "FAILED") {
        return reply.code(409).send({
          error: "Conflict",
          message: `RTO refund only from FAILED (got ${existing.deliveryStatus})`,
        });
      }

      const returns = await app.deps.repos.listReturnRequests(userId);
      let linked = returns.find((r) => r.purchaseId === id) ?? null;
      if (!linked) {
        // One open whole-order return per purchase (#61): a double tap gets the same one back, so
        // its refund keeps one ledger ref.
        const windowDeadline = computeWindowDeadline(existing.purchasedAt, existing.merchant);
        const exchangeDeadline = computeExchangeDeadline(existing.purchasedAt, existing.merchant);
        const opened = await app.deps.repos.openReturnRequest({
          userId,
          purchaseId: id,
          purchaseItemId: null,
          windowDeadline,
          exchangeDeadline,
          method: request.body.method ?? "RTO_REFUND",
          state: "INITIATED",
        });
        linked = opened.request;
        if (opened.created) {
          await scheduleReturnDeadlineReminder({
            returnId: linked.id,
            userId,
            windowDeadline: windowDeadline.toISOString(),
            merchant: existing.merchant,
          });
        }
      }
      if (linked.state === "REQUESTED") {
        try {
          linked =
            (await app.deps.repos.updateReturnRequest(
              linked.id,
              { state: "INITIATED", method: request.body.method ?? linked.method },
              { userId, fromStates: ["REQUESTED"] },
            )) ?? linked;
        } catch (err) {
          if (!(err instanceof ReturnStateConflictError)) throw err;
          // Moved on concurrently: answer with where it is now.
          linked = (await app.deps.repos.findReturnRequest(linked.id, userId)) ?? linked;
        }
      }

      trackServerEvent("rto_refund_started", {
        userId,
        purchaseId: id,
        returnId: linked.id,
      });

      let ledger = null;
      try {
        const entry = await app.deps.repos.findMoneyLedgerByRef(userId, linked.id, "REFUND");
        if (entry) ledger = { amountMinor: entry.delta, creditedAt: entry.createdAt };
      } catch {
        // ignore
      }

      return buildRtoRecoveryRow(
        {
          purchaseId: existing.id,
          merchant: existing.merchant,
          orderRef: existing.orderRef,
          totalMinor: existing.totalMinor,
          currency: existing.currency,
          deliveryStatus: existing.deliveryStatus,
          trackingCode: existing.trackingCode,
          updatedAt: existing.updatedAt,
          failedAt: existing.updatedAt,
        },
        {
          id: linked.id,
          state: linked.state,
          refundMinor: linked.refundMinor,
          tracking: linked.tracking,
          merchant: existing.merchant,
          updatedAt: linked.updatedAt,
          createdAt: linked.createdAt,
        },
        ledger,
      );
    },
  );

  // GET /packages — in-transit by default; ?all=1 for full history
  app.get(
    "/packages",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        querystring: z.object({
          all: z.enum(["0", "1"]).optional(),
        }),
        response: { 200: PackagesListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const all = request.query.all === "1";
      const filtered = await app.deps.repos.listMerchantPurchases(
        userId,
        all ? {} : { deliveryStatuses: IN_TRANSIT_STATUSES },
      );

      const ids = filtered.map((p) => p.id);
      const itemsByPurchase =
        await app.deps.repos.listMerchantPurchaseItemsByPurchaseIds(ids);

      return {
        packages: filtered.map((p) =>
          toPackageJson(
            p,
            (itemsByPurchase.get(p.id) ?? []).map((i) => i.title),
          ),
        ),
      };
    },
  );

  // PATCH /packages/:id — update delivery status / ETA / tracking
  app.patch(
    "/packages/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        params: z.object({ id: z.string().uuid() }),
        body: UpdatePackageBodySchema,
        response: {
          200: PackagesListResponseSchema.shape.packages.element,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findMerchantPurchaseById(id);
      if (!existing || existing.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }

      const nextStatus = (request.body.deliveryStatus ??
        existing.deliveryStatus) as PackageDeliveryStatus;
      if (
        request.body.deliveryStatus &&
        !isValidPackageTransition(existing.deliveryStatus, nextStatus)
      ) {
        return reply.code(409).send({
          error: "Conflict",
          message: `Cannot transition ${existing.deliveryStatus} → ${nextStatus}`,
        });
      }

      let etaAt =
        request.body.etaAt !== undefined
          ? request.body.etaAt
            ? new Date(request.body.etaAt)
            : null
          : existing.etaAt;
      if (
        request.body.deliveryStatus &&
        request.body.etaAt === undefined &&
        !etaAt
      ) {
        etaAt = defaultEtaForStatus(nextStatus, existing.purchasedAt);
      }

      const deliveredAt =
        nextStatus === "DELIVERED"
          ? existing.deliveredAt ?? new Date()
          : existing.deliveredAt;

      const updated = await app.deps.repos.updateMerchantPurchaseDelivery(
        id,
        userId,
        {
          deliveryStatus: nextStatus,
          etaAt,
          trackingCode:
            request.body.trackingCode !== undefined
              ? request.body.trackingCode
              : existing.trackingCode,
          carrier:
            request.body.carrier !== undefined ? request.body.carrier : existing.carrier,
          deliveredAt,
          deliveryAddressNote:
            request.body.deliveryAddressNote !== undefined
              ? request.body.deliveryAddressNote
              : existing.deliveryAddressNote,
          deliveryProofKeys:
            request.body.deliveryProofKeys !== undefined
              ? request.body.deliveryProofKeys
              : existing.deliveryProofKeys,
        },
      );
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }

      trackServerEvent("package_status_updated", {
        userId,
        purchaseId: id,
        deliveryStatus: nextStatus,
      });

      const items = await app.deps.repos.listMerchantPurchaseItems(id);
      return toPackageJson(
        updated,
        items.map((i) => i.title),
      );
    },
  );

  // POST /packages/:id/delivered — mark delivered + optional wardrobe suggest flag
  app.post(
    "/packages/:id/delivered",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        params: z.object({ id: z.string().uuid() }),
        body: MarkDeliveredBodySchema,
        response: {
          200: PackagesListResponseSchema.shape.packages.element.extend({
            wardrobeHint: z.string().nullable().optional(),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findMerchantPurchaseById(id);
      if (!existing || existing.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }
      if (!isValidPackageTransition(existing.deliveryStatus, "DELIVERED")) {
        return reply.code(409).send({
          error: "Conflict",
          message: `Cannot mark ${existing.deliveryStatus} as DELIVERED`,
        });
      }

      const now = new Date();
      // Seed return/exchange windows from delivery if missing
      const returnWindowDeadline =
        existing.returnWindowDeadline ??
        computeReturnWindowDeadline(now, existing.merchant);
      const exchangeWindowDeadline =
        existing.exchangeWindowDeadline ??
        computeExchangeWindowDeadline(now, existing.merchant);

      const updated = await app.deps.repos.updateMerchantPurchaseDelivery(
        id,
        userId,
        {
          deliveryStatus: "DELIVERED",
          deliveredAt: now,
          etaAt: null,
          returnWindowDeadline,
          exchangeWindowDeadline,
        },
      );
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }

      trackServerEvent("package_delivered", {
        userId,
        purchaseId: id,
        addToWardrobe: Boolean(request.body.addToWardrobe),
      });

      const items = await app.deps.repos.listMerchantPurchaseItems(id);
      const wardrobeHint = request.body.addToWardrobe
        ? "Add these items to your wardrobe now that they’ve arrived."
        : "Package delivered — add to wardrobe when you’re ready.";

      return {
        ...toPackageJson(
          updated,
          items.map((i) => i.title),
        ),
        wardrobeHint,
      };
    },
  );

  // POST /packages/:id/rto/address-fix — U023 save address note + optional reattempt
  app.post(
    "/packages/:id/rto/address-fix",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        params: z.object({ id: z.string().uuid() }),
        body: RtoAddressFixBodySchema,
        response: {
          200: PackagesListResponseSchema.shape.packages.element,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findMerchantPurchaseById(id);
      if (!existing || existing.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }
      if (existing.deliveryStatus !== "FAILED") {
        return reply.code(409).send({
          error: "Conflict",
          message: `Address fix only from FAILED (got ${existing.deliveryStatus})`,
        });
      }
      const reattempt = request.body.reattempt !== false;
      const nextStatus = reattempt ? ("SHIPPED" as const) : existing.deliveryStatus;
      if (reattempt && !isValidPackageTransition(existing.deliveryStatus, nextStatus)) {
        return reply.code(409).send({
          error: "Conflict",
          message: `Cannot transition ${existing.deliveryStatus} → ${nextStatus}`,
        });
      }
      const updated = await app.deps.repos.updateMerchantPurchaseDelivery(id, userId, {
        deliveryAddressNote: request.body.deliveryAddressNote,
        deliveryStatus: nextStatus,
        etaAt: reattempt ? defaultEtaForStatus("SHIPPED", existing.purchasedAt) : existing.etaAt,
      });
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }
      audit(app.log, "package.rto_address_fixed", {
        userId,
        purchaseId: id,
        reattempt,
      });
      trackServerEvent("rto_address_fixed", { userId, purchaseId: id, reattempt });
      const items = await app.deps.repos.listMerchantPurchaseItems(id);
      return toPackageJson(
        updated,
        items.map((i) => i.title),
      );
    },
  );

  // POST /packages/:id/delivery-proof — U024 attach photo key to dispute packet
  app.post(
    "/packages/:id/delivery-proof",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        params: z.object({ id: z.string().uuid() }),
        body: AttachDeliveryProofBodySchema,
        response: {
          200: z.object({
            purchaseId: z.string().uuid(),
            deliveryProofKeys: z.array(z.string()),
            claimPacket: z.object({
              merchant: z.string(),
              orderRef: z.string().nullable(),
              trackingCode: z.string().nullable(),
              deliveryAddressNote: z.string().nullable(),
              proofKeys: z.array(z.string()),
            }),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findMerchantPurchaseById(id);
      if (!existing || existing.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }
      const keys = [...(existing.deliveryProofKeys ?? [])];
      if (!keys.includes(request.body.imageKey)) keys.push(request.body.imageKey);
      const updated = await app.deps.repos.updateMerchantPurchaseDelivery(id, userId, {
        deliveryProofKeys: keys.slice(0, 8),
      });
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }
      audit(app.log, "package.delivery_proof_attached", {
        userId,
        purchaseId: id,
        imageKey: request.body.imageKey,
      });
      trackServerEvent("delivery_proof_attached", { userId, purchaseId: id });
      return {
        purchaseId: id,
        deliveryProofKeys: updated.deliveryProofKeys,
        claimPacket: {
          merchant: updated.merchant,
          orderRef: updated.orderRef,
          trackingCode: updated.trackingCode,
          deliveryAddressNote: updated.deliveryAddressNote,
          proofKeys: updated.deliveryProofKeys,
        },
      };
    },
  );

  // GET /packages/:id/broken-router — U028 return vs warranty
  app.get(
    "/packages/:id/broken-router",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: BrokenItemRouterResponseSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const purchase = await app.deps.repos.findMerchantPurchaseById(id);
      if (!purchase || (purchase.userId !== userId && purchase.assigneeUserId !== userId)) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }

      const warranties = await app.deps.repos.listWarranties(userId);
      const receipts = await app.deps.repos.listReceipts(userId);
      const receiptIds = new Set(
        receipts.filter((r) => r.purchaseId === id).map((r) => r.id),
      );
      const warranty =
        warranties.find((w) => w.receiptId && receiptIds.has(w.receiptId)) ??
        warranties.find(
          (w) =>
            w.provider.toLowerCase() === purchase.merchant.toLowerCase() &&
            w.state === "ACTIVE",
        ) ??
        null;

      const items = await app.deps.repos.listMerchantPurchaseItems(id);
      const routed = routeBrokenItem({
        returnWindowDeadline: purchase.returnWindowDeadline,
        exchangeDeadline: purchase.exchangeWindowDeadline,
        warrantyCoverageUntil: warranty?.coverageUntil ?? null,
        warrantyState: warranty?.state ?? null,
        itemTitle: items[0]?.title ?? purchase.merchant,
      });

      trackServerEvent("broken_item_router", {
        userId,
        purchaseId: id,
        path: routed.path,
      });

      return {
        ...routed,
        purchaseId: id,
        returnWindowDeadline: purchase.returnWindowDeadline?.toISOString() ?? null,
        warrantyId: warranty?.id ?? null,
        warrantyCoverageUntil: warranty?.coverageUntil?.toISOString() ?? null,
      };
    },
  );

  // PATCH /packages/:id/assign — U030 household assignee
  app.patch(
    "/packages/:id/assign",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        params: z.object({ id: z.string().uuid() }),
        body: AssignPackageBodySchema,
        response: {
          200: PackagesListResponseSchema.shape.packages.element,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findMerchantPurchaseById(id);
      if (!existing || existing.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }

      const assigneeUserId = request.body.assigneeUserId;
      if (assigneeUserId == null) {
        const cleared = await app.deps.repos.updateMerchantPurchase(id, {
          assigneeUserId: null,
        });
        const items = await app.deps.repos.listMerchantPurchaseItems(id);
        return toPackageJson(cleared!, items.map((i) => i.title));
      }

      const households = await app.deps.repos.listHouseholdsForUser(userId);
      let members: Array<{ userId: string; role?: string }> = [];
      let householdId = request.body.householdId ?? null;
      if (householdId) {
        const h = households.find((x) => x.id === householdId);
        if (!h) {
          return reply.code(403).send({ error: "Forbidden", message: "Not a household member" });
        }
        members = await app.deps.repos.listHouseholdMembers(householdId);
      } else if (households[0]) {
        householdId = households[0].id;
        members = await app.deps.repos.listHouseholdMembers(householdId);
      } else {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Join a household before assigning packages" });
      }

      const denial = canAssignPackage({
        actorUserId: userId,
        assigneeUserId,
        members,
      });
      if (denial) {
        return reply.code(403).send({
          error: "Forbidden",
          message:
            denial === "ASSIGNEE_NOT_MEMBER"
              ? "Assignee must be in your household"
              : "Household ACL denied",
        });
      }

      const updated = await app.deps.repos.updateMerchantPurchase(id, { assigneeUserId });
      audit(app.log, "package.assigned", {
        userId,
        purchaseId: id,
        assigneeUserId,
        householdId,
      });
      trackServerEvent("package_assigned", { userId, purchaseId: id, assigneeUserId });

      if (assigneeUserId !== userId) {
        const copy = packageAssignedPushCopy({ merchant: existing.merchant });
        try {
          await app.deps.push.send({
            userId: assigneeUserId,
            eventType: "PACKAGE_ASSIGNED",
            title: copy.title,
            body: copy.body,
            link: {
              deepLink: `worn://vault?focus=packages&id=${id}`,
              screen: "packages",
              purchaseId: id,
            },
          });
        } catch {
          // best-effort notify
        }
      }

      const items = await app.deps.repos.listMerchantPurchaseItems(id);
      const label =
        assigneeUserId === userId
          ? "You"
          : members.find((m) => m.userId === assigneeUserId)
            ? "Household member"
            : null;
      return toPackageJson(updated!, items.map((i) => i.title), { assigneeLabel: label });
    },
  );

  // POST /packages/:id/mark-cancelled — U027 user confirms merchant cancel
  app.post(
    "/packages/:id/mark-cancelled",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["packages"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: PackagesListResponseSchema.shape.packages.element,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findMerchantPurchaseById(id);
      if (!existing || existing.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Package not found" });
      }
      if (existing.deliveryStatus === "DELIVERED" || existing.deliveryStatus === "FAILED") {
        return reply.code(409).send({
          error: "Conflict",
          message: `Cannot cancel from ${existing.deliveryStatus}`,
        });
      }
      const updated = await app.deps.repos.updateMerchantPurchaseDelivery(id, userId, {
        deliveryStatus: "CANCELLED",
        etaAt: null,
      });
      trackServerEvent("purchase_cooling_off_cancelled", { userId, purchaseId: id });
      const items = await app.deps.repos.listMerchantPurchaseItems(id);
      return toPackageJson(updated!, items.map((i) => i.title));
    },
  );
};
