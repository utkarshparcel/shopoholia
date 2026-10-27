import {
  ConsentListResponseSchema,
  ConsentScopeSchema,
  GrantConsentBodySchema,
  GrantConsentResponseSchema,
  NotificationPreferencesResponseSchema,
  UpdateNotificationPreferencesBodySchema,
  VaultExportSchema,
  mergeNotificationPreferences,
  parseNotificationPreferences,
  NOTIFICATION_PREFS_FLAG_KEY,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { audit, listAuditRecords } from "../lib/audit.js";
import { trackServerEvent } from "../lib/analytics.js";
import type { ConsentGrantRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toConsentJson(g: ConsentGrantRecord) {
  return {
    id: g.id,
    userId: g.userId,
    scope: g.scope,
    grantedAt: g.grantedAt.toISOString(),
    revokedAt: g.revokedAt ? g.revokedAt.toISOString() : null,
    source: g.source,
    meta: g.meta,
  };
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function toAccountExport(a: {
  id: string;
  kind: string;
  merchant: string;
  currency: string;
  balanceCacheMinor: number;
  expiresAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    kind: a.kind,
    merchant: a.merchant,
    currency: a.currency,
    balanceCacheMinor: a.balanceCacheMinor,
    expiresAt: iso(a.expiresAt),
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function toLedgerExport(l: {
  id: string;
  accountId: string;
  delta: number;
  type: string;
  refType: string | null;
  refId: string | null;
  balanceAfter: number;
  createdAt: Date;
}) {
  return {
    id: l.id,
    accountId: l.accountId,
    delta: l.delta,
    type: l.type,
    refType: l.refType,
    refId: l.refId,
    balanceAfter: l.balanceAfter,
    createdAt: l.createdAt.toISOString(),
  };
}

function toReceiptExport(r: {
  id: string;
  merchant: string;
  purchasedAt: Date;
  totalMinor: number;
  imageKey: string;
  purchaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    merchant: r.merchant,
    purchasedAt: r.purchasedAt.toISOString(),
    totalMinor: r.totalMinor,
    imageKey: r.imageKey,
    purchaseId: r.purchaseId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toWarrantyExport(w: {
  id: string;
  receiptId: string | null;
  itemTitle: string;
  provider: string;
  coverageUntil: Date;
  claimContact: string | null;
  category?: string | null;
  state: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: w.id,
    receiptId: w.receiptId,
    itemTitle: w.itemTitle,
    provider: w.provider,
    coverageUntil: w.coverageUntil.toISOString(),
    claimContact: w.claimContact,
    category: w.category ?? null,
    state: w.state,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

function serializeRecords(records: unknown[]): Record<string, unknown>[] {
  return records.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      if (v instanceof Date) out[k] = v.toISOString();
      else out[k] = v;
    }
    return out;
  });
}

export const vaultRoutes: FastifyPluginAsyncZod = async (app) => {
  // Source of truth: live grants from the consent ledger (consent_grants).
  // The mobile Consent Center reads this endpoint directly — no cached flags.
  app.get(
    "/vault/consent",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        response: {
          200: ConsentListResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const grants = await app.deps.repos.listActiveConsents(userId);
      return { grants: grants.map(toConsentJson) };
    },
  );

  // Queryable audit log — returns recent audit rows for the authed user.
  // Filterable via ?event=consent.granted&limit=50 for debugging/compliance.
  app.get(
    "/vault/audit",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        querystring: z.object({
          event: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
        response: {
          200: z.object({
            records: z.array(
              z.object({
                id: z.string(),
                event: z.string(),
                userId: z.string().optional(),
                timestamp: z.string(),
                payload: z.record(z.string(), z.unknown()),
              }),
            ),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const { event, limit } = request.query as { event?: string; limit?: number };
      const records = listAuditRecords({ userId, event, limit });
      return { records };
    },
  );

  // Alias for generic audit query: GET /audit?userId= (admin) or self
  app.get(
    "/audit",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        querystring: z.object({
          userId: z.string().uuid().optional(),
          event: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
        response: {
          200: z.object({
            records: z.array(
              z.object({
                id: z.string(),
                event: z.string(),
                userId: z.string().optional(),
                timestamp: z.string(),
                payload: z.record(z.string(), z.unknown()),
              }),
            ),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const callerId = request.user!.sub;
      const { userId, event, limit } = request.query as {
        userId?: string;
        event?: string;
        limit?: number;
      };
      // Non-admin callers can only query their own audit rows.
      const targetUserId = userId ?? callerId;
      if (userId && userId !== callerId) {
        // In production check admin role; for now restrict to self.
        return { records: [] };
      }
      const records = listAuditRecords({ userId: targetUserId, event, limit });
      return { records };
    },
  );

  app.post(
    "/vault/consent",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        body: GrantConsentBodySchema,
        response: {
          201: GrantConsentResponseSchema,
          401: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { scope, source, meta } = request.body;

      const existing = await app.deps.repos.findActiveConsent(userId, scope);
      if (existing) {
        return reply.code(409).send({
          error: "Conflict",
          message: `Consent for ${scope} already granted`,
        });
      }

      const grant = await app.deps.repos.grantConsent({ userId, scope, source, meta });
      audit(app.log, "consent.granted", { userId, scope });
      trackServerEvent("consent_granted", { userId, scope });
      return reply.code(201).send(toConsentJson(grant));
    },
  );

  app.delete(
    "/vault/consent/:scope",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        params: z.object({ scope: ConsentScopeSchema }),
        response: {
          204: z.null(),
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { scope } = request.params;
      await app.deps.repos.revokeConsent(userId, scope);
      audit(app.log, "consent.revoked", { userId, scope });
      trackServerEvent("consent_revoked", { userId, scope });
      return reply.code(204).send(null);
    },
  );

  app.get(
    "/vault/export",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        response: {
          200: VaultExportSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;

      const [
        grants,
        moneyAccounts,
        moneyLedger,
        receipts,
        warranties,
        ingestionSources,
        merchantPurchases,
        ingestionDocuments,
        orders,
        orderItems,
        carts,
        cartItems,
        sellers,
        listings,
        listingVariants,
        avatars,
        renders,
        tryonPreviews,
        pushEvents,
        coinLedger,
        iapReceipts,
        cashbackEvents,
        budgets,
        spendRollups,
        returnRequests,
        returnEvents,
        recipients,
        recipientProfiles,
        giftOrders,
        measurementProfiles,
        customizationTemplates,
        tailoringOrders,
        wardrobeItems,
        outfits,
        wearLog,
        itemMetrics,
        dispositionListings,
      ] = await Promise.all([
        app.deps.repos.listActiveConsents(userId),
        app.deps.repos.listMoneyAccounts(userId),
        app.deps.repos.listMoneyLedgerByUser(userId),
        app.deps.repos.listReceipts(userId),
        app.deps.repos.listWarranties(userId),
        app.deps.repos.listIngestionSources(userId),
        app.deps.repos.listMerchantPurchasesByUser(userId),
        app.deps.repos.listIngestionDocumentsByUser(userId),
        app.deps.repos.listOrdersByUserId(userId),
        app.deps.repos.listOrderItemsByUser(userId),
        app.deps.repos.listCartsByUser(userId),
        app.deps.repos.listCartItemsByUser(userId),
        app.deps.repos.listSellersByUser(userId),
        app.deps.repos.listListingsByUser(userId),
        app.deps.repos.listListingVariantsByUser(userId),
        app.deps.repos.listAvatarsByUser(userId),
        app.deps.repos.listRendersByUser(userId),
        app.deps.repos.listTryonPreviewsByUser(userId),
        app.deps.repos.listPushEvents(userId),
        app.deps.repos.listCoinLedgerByUser(userId),
        app.deps.repos.listIapReceiptsByUser(userId),
        app.deps.repos.listCashbackEvents(userId),
        app.deps.repos.listBudgets(userId),
        app.deps.repos.getSpendRollups(userId),
        app.deps.repos.listReturnRequests(userId),
        app.deps.repos.listReturnEventsByUser(userId),
        app.deps.repos.listRecipients(userId),
        app.deps.repos.listRecipientProfilesByUser(userId),
        app.deps.repos.listGiftOrders(userId),
        app.deps.repos.listMeasurementProfiles(userId),
        app.deps.repos.listCustomizationTemplates(),
        app.deps.repos.listTailoringOrders(userId),
        app.deps.repos.listWardrobeItems(userId),
        app.deps.repos.listOutfits(userId),
        app.deps.repos.listWearLogs(userId),
        app.deps.repos.getItemMetrics(userId),
        app.deps.repos.listDispositionListings(userId),
      ]);

      // Redact tokens — never export secrets. Keep the metadata so the user
      // can see what they connected.
      const safeSources = ingestionSources.map((s) => ({
        ...s,
        encryptedToken: null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        lastSyncAt: s.lastSyncAt ? s.lastSyncAt.toISOString() : null,
      }));

      const purchaseIds = merchantPurchases.map((p) => p.id);
      const itemsByPurchase =
        await app.deps.repos.listMerchantPurchaseItemsByPurchaseIds(purchaseIds);
      const merchantPurchaseItems = [...itemsByPurchase.values()].flat();

      audit(app.log, "consent.exported", { userId });
      trackServerEvent("vault_export", { userId });
      return {
        grants: grants.map(toConsentJson),
        moneyAccounts: moneyAccounts.map(toAccountExport),
        moneyLedger: moneyLedger.map(toLedgerExport),
        receipts: receipts.map(toReceiptExport),
        warranties: warranties.map(toWarrantyExport),
        ingestionSources: safeSources,
        merchantPurchases: serializeRecords(merchantPurchases),
        merchantPurchaseItems: serializeRecords(merchantPurchaseItems),
        ingestionDocuments: serializeRecords(ingestionDocuments),
        orders: serializeRecords(orders),
        orderItems: serializeRecords(orderItems),
        carts: serializeRecords(carts),
        cartItems: serializeRecords(cartItems),
        sellers: serializeRecords(sellers),
        listings: serializeRecords(listings),
        listingVariants: serializeRecords(listingVariants),
        avatars: serializeRecords(avatars),
        renders: serializeRecords(renders),
        tryonPreviews: serializeRecords(tryonPreviews),
        pushEvents: serializeRecords(pushEvents),
        coinLedger: serializeRecords(coinLedger),
        iapReceipts: serializeRecords(iapReceipts),
        cashbackEvents: serializeRecords(cashbackEvents),
        budgets: serializeRecords(budgets),
        spendRollups: serializeRecords(spendRollups),
        returnRequests: serializeRecords(returnRequests),
        returnEvents: serializeRecords(returnEvents),
        recipients: serializeRecords(recipients),
        recipientProfiles: serializeRecords(recipientProfiles),
        giftOrders: serializeRecords(giftOrders),
        measurementProfiles: serializeRecords(measurementProfiles),
        customizationTemplates: serializeRecords(customizationTemplates),
        tailoringOrders: serializeRecords(tailoringOrders),
        wardrobeItems: serializeRecords(wardrobeItems),
        outfits: serializeRecords(outfits),
        wearLog: serializeRecords(wearLog),
        itemMetrics: serializeRecords(itemMetrics),
        dispositionListings: serializeRecords(dispositionListings),
      };
    },
  );

  app.delete(
    "/vault",
    {
      preHandler: requireAuth,
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 5,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["vault"],
        response: {
          204: z.null(),
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;

      // Collect object-storage keys before hard-delete so R2/mock blobs
      // can be removed after the DB wipe.
      const [receipts, documents, avatars] = await Promise.all([
        app.deps.repos.listReceipts(userId),
        app.deps.repos.listIngestionDocumentsByUser(userId),
        app.deps.repos.listAvatarsByUser(userId),
      ]);
      const storageKeys: string[] = [];
      for (const r of receipts) {
        if (r.imageKey) storageKeys.push(r.imageKey);
      }
      for (const d of documents) {
        if (d.rawKey) storageKeys.push(d.rawKey);
      }
      for (const a of avatars) {
        if (a.referenceImageKey) storageKeys.push(a.referenceImageKey);
        for (const k of a.sourceUploadKeys ?? []) storageKeys.push(k);
      }

      await app.deps.repos.deleteAllUserData(userId);

      if (storageKeys.length > 0 && app.deps.storage?.deleteMany) {
        await app.deps.storage.deleteMany(storageKeys).catch((err) => {
          app.log.warn({ err, userId, count: storageKeys.length }, "vault.delete.storage_cleanup_failed");
        });
      }

      audit(app.log, "vault.deleted", { userId });
      trackServerEvent("vault_deleted", { userId });
      return reply.code(204).send(null);
    },
  );

  // Stored under users.consentFlags.notifications (no migration).
  app.get(
    "/vault/notification-preferences",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        response: {
          200: NotificationPreferencesResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const user = await app.deps.repos.findUserById(userId);
      return parseNotificationPreferences(user?.consentFlags);
    },
  );

  app.put(
    "/vault/notification-preferences",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        body: UpdateNotificationPreferencesBodySchema,
        response: {
          200: NotificationPreferencesResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const user = await app.deps.repos.findUserById(userId);
      const current = parseNotificationPreferences(user?.consentFlags);
      const next = mergeNotificationPreferences(current, request.body);
      const consentFlags = {
        ...(user?.consentFlags ?? {}),
        [NOTIFICATION_PREFS_FLAG_KEY]: next,
      };
      await app.deps.repos.updateUser(userId, { consentFlags });
      audit(app.log, "vault.notification_preferences.updated", { userId });
      return next;
    },
  );
};
