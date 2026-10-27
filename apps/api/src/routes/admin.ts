import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  ConciergeListBodySchema,
  ConciergeListResponseSchema,
  ConciergePhotoDumpBodySchema,
  ConciergePhotoDumpResponseSchema,
  ConciergeSortBodySchema,
  ConciergeSortResponseSchema,
  ConciergeUserParamsSchema,
  ConciergeWardrobeResponseSchema,
  careRulesOrNull,
  type ConciergeListBody,
  type ConciergePhotoDumpBody,
  type ConciergeSortBody,
} from "@worn/shared";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { audit } from "../lib/audit.js";
import { reconcileMoneyAccounts } from "../lib/money-reconcile.js";
import { purgeExpiredIngestionDocuments } from "../lib/retention.js";
import { runPhotoDump } from "../lib/photo-dump.js";
import { requireConciergeConsentForUser } from "../lib/concierge-ops.js";
import { prepareDispositionRails } from "../lib/disposition-marketplace.js";
import { OPS_PLAYBOOKS } from "../lib/ops-playbooks.js";
import type { DispositionListingRecord, WardrobeItemRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Admin routes require X-Admin-Secret matching ADMIN_SECRET.
 * Fail closed when ADMIN_SECRET is unset (including production).
 * JWT alone is never sufficient.
 */
async function requireAdminSecret(request: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Admin endpoints are disabled (ADMIN_SECRET not configured)",
    });
  }
  const provided = request.headers["x-admin-secret"];
  if (typeof provided !== "string" || !secretsEqual(provided, expected)) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Invalid or missing X-Admin-Secret",
    });
  }
}

function toWardrobeJson(
  r: {
    id: string;
    userId: string;
    source: WardrobeItemRecord["source"];
    category: string;
    colors: string[];
    brand: string | null;
    costMinor: number;
    imageKeys: string[];
    garmentImageKey: string | null;
    purchaseItemId: string | null;
    laundryStatus?: WardrobeItemRecord["laundryStatus"];
    closetStatus?: WardrobeItemRecord["closetStatus"];
    tags?: string[];
    careRules?: Record<string, unknown> | null;
    dryCleanTicket?: string | null;
    dryCleanPickupOn?: string | null;
    lentTo?: string | null;
    lentDueOn?: string | null;
    profileId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  imageUrls: string[],
  garmentImageUrl: string | null,
) {
  return {
    id: r.id,
    userId: r.userId,
    source: r.source,
    category: r.category,
    colors: r.colors,
    brand: r.brand,
    costMinor: r.costMinor,
    imageKeys: r.imageKeys,
    garmentImageKey: r.garmentImageKey,
    purchaseItemId: r.purchaseItemId,
    laundryStatus: r.laundryStatus ?? "CLEAN",
    closetStatus: r.closetStatus ?? "ACTIVE",
    tags: r.tags ?? [],
    careRules: careRulesOrNull(r.careRules),
    dryCleanTicket: r.dryCleanTicket ?? null,
    dryCleanPickupOn: r.dryCleanPickupOn ?? null,
    lentTo: r.lentTo ?? null,
    lentDueOn: r.lentDueOn ?? null,
    profileId: r.profileId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    imageUrls,
    garmentImageUrl,
  };
}

function toDispositionJson(r: DispositionListingRecord) {
  return {
    id: r.id,
    userId: r.userId,
    wardrobeItemId: r.wardrobeItemId,
    mode: r.mode,
    priceMinor: r.priceMinor,
    status: r.status,
    sellerId: r.sellerId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  // Auth-gated reconciliation trigger. Healing is enabled by default;
  // pass ?fix=false to dry-run. Returns per-account drift details.
  app.get(
    "/admin/money/reconcile",
    {
      preHandler: [requireAuth, requireAdminSecret],
      schema: {
        tags: ["admin"],
        querystring: z.object({
          fix: z.enum(["true", "false"]).optional(),
        }),
        response: {
          200: z.object({
            checked: z.number(),
            mismatched: z.number(),
            fixed: z.number(),
            mismatches: z.array(
              z.object({
                accountId: z.string(),
                userId: z.string(),
                merchant: z.string(),
                cachedMinor: z.number(),
                ledgerSumMinor: z.number(),
                lastBalanceAfter: z.number().nullable(),
                driftMinor: z.number(),
                fixed: z.boolean(),
              }),
            ),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const fix = request.query.fix !== "false";
      const result = await reconcileMoneyAccounts(app.deps.repos, app.log, { fix });
      return result;
    },
  );

  // Trigger retention purge (also runs on a schedule in production).
  app.post(
    "/admin/ingestion/retention/purge",
    {
      preHandler: [requireAuth, requireAdminSecret],
      schema: {
        tags: ["admin"],
        response: {
          200: z.object({
            checked: z.number(),
            purged: z.number(),
            cutoff: z.string(),
            retentionDays: z.number(),
            schedule: z.object({
              EMAIL: z.number(),
              SMS: z.number(),
              RECEIPT: z.number(),
            }),
            purgedByKind: z.object({
              EMAIL: z.number(),
              SMS: z.number(),
              RECEIPT: z.number(),
            }),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async () => {
      const result = await purgeExpiredIngestionDocuments(app.deps.repos, app.deps.storage, app.log);
      return result;
    },
  );

  // OPS-PLAYBOOKS — support runbooks for parser / refund / deletion SLAs.
  app.get(
    "/admin/ops/playbooks",
    {
      preHandler: [requireAuth, requireAdminSecret],
      schema: {
        tags: ["admin"],
        response: {
          200: z.object({
            playbooks: z.array(
              z.object({
                id: z.enum(["parser-breakage", "refund-disputes", "data-deletion"]),
                title: z.string(),
                path: z.string(),
                summary: z.string(),
              }),
            ),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async () => ({ playbooks: [...OPS_PLAYBOOKS] }),
  );

  // --- CONCIERGE-OPS: operator console (JWT + admin secret + user CONCIERGE consent) ---

  app.get(
    "/admin/concierge/:userId/wardrobe",
    {
      preHandler: [requireAuth, requireAdminSecret],
      schema: {
        tags: ["admin", "concierge"],
        params: ConciergeUserParamsSchema,
        response: {
          200: ConciergeWardrobeResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const operatorId = request.user!.sub;
      const { userId: targetUserId } = request.params as { userId: string };
      if (!(await requireConciergeConsentForUser(request, reply, targetUserId))) return;
      const rows = await app.deps.repos.listWardrobeItems(targetUserId);
      const items = await Promise.all(
        rows.map(async (r) => {
          const imageUrls = await Promise.all(
            (r.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
          );
          const garmentImageUrl = r.garmentImageKey
            ? await app.deps.storage.getSignedUrl(r.garmentImageKey)
            : null;
          return toWardrobeJson(r, imageUrls, garmentImageUrl);
        }),
      );
      audit(app.log, "concierge.wardrobe.read", {
        userId: targetUserId,
        operatorId,
        count: items.length,
      });
      return { items, operatorId, targetUserId };
    },
  );

  app.post(
    "/admin/concierge/:userId/photo-dump",
    {
      preHandler: [requireAuth, requireAdminSecret],
      schema: {
        tags: ["admin", "concierge"],
        params: ConciergeUserParamsSchema,
        body: ConciergePhotoDumpBodySchema,
        response: {
          201: ConciergePhotoDumpResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const operatorId = request.user!.sub;
      const { userId: targetUserId } = request.params as { userId: string };
      if (!(await requireConciergeConsentForUser(request, reply, targetUserId))) return;
      const body = request.body as ConciergePhotoDumpBody;
      const { records, tagged, duplicateWarnings } = await runPhotoDump(app.deps.repos, {
        userId: targetUserId,
        photos: body.photos,
        profileId: body.profileId,
        extraTags: ["concierge"],
      });
      const items = await Promise.all(
        records.map(async (item) => {
          const imageUrls = await Promise.all(
            (item.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
          );
          const garmentImageUrl = item.garmentImageKey
            ? await app.deps.storage.getSignedUrl(item.garmentImageKey)
            : null;
          return toWardrobeJson(item, imageUrls, garmentImageUrl);
        }),
      );
      audit(app.log, "concierge.ingest", {
        userId: targetUserId,
        operatorId,
        count: items.length,
        tagged,
      });
      return reply.code(201).send({
        items,
        created: items.length,
        tagged,
        duplicateWarnings,
        operatorId,
        targetUserId,
      });
    },
  );

  app.patch(
    "/admin/concierge/:userId/items/:itemId",
    {
      preHandler: [requireAuth, requireAdminSecret],
      schema: {
        tags: ["admin", "concierge"],
        params: ConciergeUserParamsSchema.extend({ itemId: z.string().uuid() }),
        body: ConciergeSortBodySchema,
        response: {
          200: ConciergeSortResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const operatorId = request.user!.sub;
      const { userId: targetUserId, itemId } = request.params as {
        userId: string;
        itemId: string;
      };
      if (!(await requireConciergeConsentForUser(request, reply, targetUserId))) return;
      const body = request.body as ConciergeSortBody;
      const updated = await app.deps.repos.updateWardrobeItem(itemId, targetUserId, body);
      if (!updated) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Wardrobe item not found for target user",
        });
      }
      const imageUrls = await Promise.all(
        (updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      audit(app.log, "concierge.sort", {
        userId: targetUserId,
        operatorId,
        itemId,
        patch: body,
      });
      return {
        item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
        operatorId,
        targetUserId,
      };
    },
  );

  app.post(
    "/admin/concierge/:userId/list",
    {
      preHandler: [requireAuth, requireAdminSecret],
      schema: {
        tags: ["admin", "concierge"],
        params: ConciergeUserParamsSchema,
        body: ConciergeListBodySchema,
        response: {
          201: ConciergeListResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const operatorId = request.user!.sub;
      const { userId: targetUserId } = request.params as { userId: string };
      if (!(await requireConciergeConsentForUser(request, reply, targetUserId))) return;
      const body = request.body as ConciergeListBody;
      const listings = [];
      for (const entry of body.items) {
        const wardrobeItem = await app.deps.repos.findWardrobeItem(
          entry.wardrobeItemId,
          targetUserId,
        );
        if (!wardrobeItem) {
          return reply.code(404).send({
            error: "Not Found",
            message: `Wardrobe item ${entry.wardrobeItemId} not found for target user`,
          });
        }
        const rails = await prepareDispositionRails(
          app.deps.repos,
          targetUserId,
          wardrobeItem,
          entry.mode,
          entry.priceMinor,
        );
        const listing = await app.deps.repos.createDispositionListing({
          userId: targetUserId,
          wardrobeItemId: entry.wardrobeItemId,
          mode: entry.mode,
          priceMinor: entry.priceMinor ?? null,
          sellerId: rails.sellerId,
        });
        listings.push(toDispositionJson(listing));
      }
      audit(app.log, "concierge.list", {
        userId: targetUserId,
        operatorId,
        listed: listings.length,
        listingIds: listings.map((l) => l.id),
      });
      return reply.code(201).send({
        listings,
        listed: listings.length,
        operatorId,
        targetUserId,
      });
    },
  );
};
