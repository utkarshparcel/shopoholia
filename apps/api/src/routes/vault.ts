import {
  CONSENT_NOTICE_VERSION,
  ConsentListResponseSchema,
  ConsentRecordSchema,
  ConsentScopeSchema,
  GrantConsentBodySchema,
  GrantConsentResponseSchema,
  NotificationPreferencesResponseSchema,
  PRIVACY_ERASE_QUEUE,
  PRIVACY_EXPORT_QUEUE,
  PrivacyRequestSchema,
  UpdateNotificationPreferencesBodySchema,
  VaultExportSchema,
  mapLimit,
  mergeNotificationPreferences,
  parseNotificationPreferences,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { audit, flushAudit, registerAuditSink } from "../lib/audit.js";
import { trackServerEvent } from "../lib/analytics.js";
import { assertPrivacySecretConfigured, subjectRefFor } from "../lib/privacy-hmac.js";
import { enqueueJob, jobIdFrom } from "../lib/queues/enqueue.js";
import type {
  AuditLogRecord,
  ConsentGrantRecord,
  PrivacyRequestRecord,
} from "../lib/repositories/types.js";
import { disconnectEmailSources } from "../jobs/gmail-token-revoke.js";

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
    noticeVersion: g.noticeVersion ?? null,
  };
}

/** Signed export links are short-lived; the file itself is deleted after 7 days. */
const EXPORT_URL_TTL_SECONDS = 15 * 60;
/** Rows per table in the synchronous GET /vault/export (the full file is POST /vault/export). */
const SYNC_EXPORT_MAX_ROWS = 1_000;

/** Tables the legacy GET /vault/export fields already carry; the rest go under `tables`. */
const LEGACY_EXPORT_TABLES = new Set([
  "users",
  "consent_grants",
  "money_accounts",
  "money_ledger",
  "receipts",
  "warranties",
  "ingestion_sources",
  "merchant_purchases",
  "merchant_purchase_items",
  "ingestion_documents",
  "orders",
  "order_items",
  "carts",
  "cart_items",
  "sellers",
  "listings",
  "listing_variants",
  "avatars",
  "renders",
  "tryon_previews",
  "push_events",
  "coin_ledger",
  "iap_receipts",
  "cashback_events",
  "budgets",
  "spend_rollups",
  "return_requests",
  "return_events",
  "recipients",
  "recipient_profiles",
  "gift_orders",
  "measurement_profiles",
  "tailoring_orders",
  "wardrobe_items",
  "outfits",
  "wear_log",
  "item_metrics",
  "disposition_listings",
]);

/** Runs the loaders at most 4 at a time instead of holding one pool connection per loader. */
function loadAll<T extends readonly (() => Promise<unknown>)[]>(loaders: [...T]) {
  return mapLimit(loaders, 4, (load) => load()) as Promise<{
    [K in keyof T]: T[K] extends () => Promise<infer R> ? R : never;
  }>;
}

const AuditRecordJsonSchema = z.object({
  id: z.string(),
  event: z.string(),
  userId: z.string().optional(),
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

function toAuditJson(r: AuditLogRecord) {
  return {
    id: r.id,
    event: r.event,
    ...(r.userId ? { userId: r.userId } : {}),
    timestamp: r.at.toISOString(),
    payload: r.meta,
  };
}

function toPrivacyRequestJson(r: PrivacyRequestRecord, downloadUrl?: string | null) {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    ...(downloadUrl !== undefined ? { downloadUrl } : {}),
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
  // Production refuses to boot without PRIVACY_HMAC_SECRET (subject refs, poll tokens).
  assertPrivacySecretConfigured();
  // Durable audit: every audit() call is also written to audit_log, in micro-batches.
  const unregisterAuditSink = registerAuditSink(
    app.deps.repos,
    (rows) => app.deps.repos.appendAuditRecords(rows),
    app.log,
  );
  app.addHook("onClose", async () => {
    await flushAudit();
    unregisterAuditSink();
  });

  /** Newest first, at most `limit`, optionally one event (filtered within the newest 500). */
  async function listAudit(userId: string, event: string | undefined, limit: number) {
    await flushAudit();
    const rows = await app.deps.repos.listAuditRecordsByUser(userId, { limit: event ? 500 : limit });
    return rows.filter((r) => !event || r.event === event).slice(0, limit).map(toAuditJson);
  }

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
          200: z.object({ records: z.array(AuditRecordJsonSchema) }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const { event, limit } = request.query as { event?: string; limit?: number };
      return { records: await listAudit(userId, event, limit ?? 100) };
    },
  );

  // Alias for generic audit query: GET /audit (self only; another user's id is 404).
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
          200: z.object({ records: z.array(AuditRecordJsonSchema) }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const callerId = request.user!.sub;
      const { userId, event, limit } = request.query as {
        userId?: string;
        event?: string;
        limit?: number;
      };
      // Owner-only: another user's audit trail is not found, not forbidden.
      if (userId && userId !== callerId) {
        return reply.code(404).send({ error: "Not Found", message: "Audit records not found" });
      }
      return { records: await listAudit(callerId, event, limit ?? 100) };
    },
  );

  // Append-only consent history (every grant and withdrawal, with the notice version).
  app.get(
    "/vault/consent/records",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
        response: {
          200: z.object({ records: z.array(ConsentRecordSchema) }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const rows = await app.deps.repos.listConsentRecords(userId, request.query.limit ?? 100);
      return {
        records: rows.map((r) => ({
          id: r.id,
          scope: r.scope,
          action: r.action,
          noticeVersion: r.noticeVersion,
          source: r.source,
          grantId: r.grantId,
          createdAt: r.createdAt.toISOString(),
        })),
      };
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
          200: GrantConsentResponseSchema,
          201: GrantConsentResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      // body.userId is ignored: a grant is always for the signed-in user.
      const userId = request.user!.sub;
      const { scope, source, meta } = request.body;
      const noticeVersion = request.body.noticeVersion ?? CONSENT_NOTICE_VERSION;

      // Granting twice returns the live grant (200). grantConsent is itself race-safe: a
      // concurrent duplicate gets the row the other request inserted.
      const existing = await app.deps.repos.findActiveConsent(userId, scope);
      if (existing) return reply.code(200).send(toConsentJson(existing));

      const grant = await app.deps.repos.grantConsent({ userId, scope, source, meta, noticeVersion });
      audit(app.log, "consent.granted", { userId, scope, grantId: grant.id });
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
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { scope } = request.params;
      // Withdrawal stops processing: requireConsent fails from here on, and for EMAIL the Gmail
      // sources are disconnected and their tokens revoked at Google (a C6 job per token).
      // Safe to retry: a repeat revokes nothing new and the revoke jobs dedupe by id.
      await app.deps.repos.revokeConsent(userId, scope);
      if (scope === "EMAIL") {
        const result = await disconnectEmailSources(app.deps.repos, userId);
        audit(app.log, "ingestion.source.disconnected", {
          userId,
          disconnected: result.disconnected,
          revokesQueued: result.revokesQueued,
        });
      }
      audit(app.log, "consent.revoked", { userId, scope });
      trackServerEvent("consent_revoked", { userId, scope });
      return reply.code(204).send(null);
    },
  );

  // Full export, off the request path: 202 with the request; poll GET /vault/requests/:id.
  app.post(
    "/vault/export",
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
          202: PrivacyRequestSchema,
          401: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      // A second request while one is open returns that one (open-request unique index).
      const { request: req, created } = await app.deps.repos.createPrivacyRequest({
        userId,
        subjectRef: subjectRefFor(userId),
        kind: "EXPORT",
      });
      await enqueueJob(
        PRIVACY_EXPORT_QUEUE,
        "export",
        { requestId: req.id },
        { jobId: jobIdFrom("privacy-export", req.id) },
      );
      if (created) {
        audit(app.log, "privacy.export.requested", { userId, requestId: req.id });
        trackServerEvent("vault_export", { userId });
      }
      return reply.code(202).send(toPrivacyRequestJson(req));
    },
  );

  app.get(
    "/vault/requests/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["vault"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: PrivacyRequestSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const req = await app.deps.repos.getPrivacyRequest(request.params.id);
      if (!req || req.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Request not found" });
      }
      const downloadUrl =
        req.kind === "EXPORT" && req.status === "DONE" && req.resultKey
          ? await app.deps.storage.getSignedUrl(req.resultKey, EXPORT_URL_TTL_SECONDS)
          : null;
      return toPrivacyRequestJson(req, downloadUrl);
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
        allTables,
      ] = await loadAll([
        () => app.deps.repos.listActiveConsents(userId),
        () => app.deps.repos.listMoneyAccounts(userId),
        () => app.deps.repos.listMoneyLedgerByUser(userId),
        () => app.deps.repos.listReceipts(userId),
        () => app.deps.repos.listWarranties(userId),
        () => app.deps.repos.listIngestionSources(userId),
        () => app.deps.repos.listMerchantPurchasesByUser(userId),
        () => app.deps.repos.listIngestionDocumentsByUser(userId),
        () => app.deps.repos.listOrdersByUserId(userId),
        () => app.deps.repos.listOrderItemsByUser(userId),
        () => app.deps.repos.listCartsByUser(userId),
        () => app.deps.repos.listCartItemsByUser(userId),
        () => app.deps.repos.listSellersByUser(userId),
        () => app.deps.repos.listListingsByUser(userId),
        () => app.deps.repos.listListingVariantsByUser(userId),
        () => app.deps.repos.listAvatarsByUser(userId),
        () => app.deps.repos.listRendersByUser(userId),
        () => app.deps.repos.listTryonPreviewsByUser(userId),
        () => app.deps.repos.listPushEvents(userId),
        () => app.deps.repos.listCoinLedgerByUser(userId),
        () => app.deps.repos.listIapReceiptsByUser(userId),
        () => app.deps.repos.listCashbackEvents(userId),
        () => app.deps.repos.listBudgets(userId),
        () => app.deps.repos.getSpendRollups(userId),
        () => app.deps.repos.listReturnRequests(userId),
        () => app.deps.repos.listReturnEventsByUser(userId),
        () => app.deps.repos.listRecipients(userId),
        () => app.deps.repos.listRecipientProfilesByUser(userId),
        () => app.deps.repos.listGiftOrders(userId),
        () => app.deps.repos.listMeasurementProfiles(userId),
        () => app.deps.repos.listCustomizationTemplates(),
        () => app.deps.repos.listTailoringOrders(userId),
        () => app.deps.repos.listWardrobeItems(userId),
        () => app.deps.repos.listOutfits(userId),
        () => app.deps.repos.listWearLogs(userId),
        () => app.deps.repos.getItemMetrics(userId),
        () => app.deps.repos.listDispositionListings(userId),
        // Every other user table (closet profiles, households, polls, consent history...).
        () => app.deps.repos.exportUserTables(userId, SYNC_EXPORT_MAX_ROWS),
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

      const tables = Object.fromEntries(
        Object.entries(allTables.tables)
          .filter(([name]) => !LEGACY_EXPORT_TABLES.has(name))
          .map(([name, rows]) => [name, serializeRecords(rows)]),
      );
      const userRow = allTables.tables.users?.[0];

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
        ...(userRow ? { user: serializeRecords([userRow])[0] } : {}),
        tables,
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
          202: PrivacyRequestSchema,
          401: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      // Erasure runs as the privacy-erase job (rows, stored objects, Gmail tokens). A repeated
      // DELETE while one is open returns the same request and enqueues the same job id.
      const { request: req, created } = await app.deps.repos.createPrivacyRequest({
        userId,
        subjectRef: subjectRefFor(userId),
        kind: "ERASE",
      });
      await enqueueJob(
        PRIVACY_ERASE_QUEUE,
        "erase",
        { requestId: req.id },
        { jobId: jobIdFrom("privacy-erase", req.id), attempts: 5 },
      );
      if (created) {
        audit(app.log, "privacy.erase.requested", { userId, requestId: req.id });
        trackServerEvent("vault_deleted", { userId });
      }
      return reply.code(202).send(toPrivacyRequestJson(req));
    },
  );

  // Stored under users.prefs.notifications (C2: written only through patchUserPrefs).
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
      const prefs = await app.deps.repos.getUserPrefs(userId);
      return parseNotificationPreferences(prefs);
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
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const prefs = await app.deps.repos.getUserPrefs(userId);
      if (!prefs) return reply.code(404).send({ error: "Not Found", message: "User not found" });
      const next = mergeNotificationPreferences(parseNotificationPreferences(prefs), request.body);
      // One atomic jsonb update of this key only; other prefs keys written concurrently survive.
      const saved = await app.deps.repos.patchUserPrefs(userId, { notifications: next });
      if (!saved) return reply.code(404).send({ error: "Not Found", message: "User not found" });
      audit(app.log, "vault.notification_preferences.updated", { userId });
      return next;
    },
  );
};
