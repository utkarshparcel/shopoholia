/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import {
  CapsuleBodySchema,
  CapsuleResponseSchema,
  CreateWardrobeItemBodySchema,
  CreateWearBodySchema,
  BulkCreateWardrobeBodySchema,
  BulkCreateWardrobeResponseSchema,
  BulkUpdateWardrobeItemsBodySchema,
  BulkUpdateWardrobeItemsResponseSchema,
  PageQuerySchema,
  PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS,
  localDateKey,
  mapLimit,
  resolveTimeZone,
  PhotoDumpBodySchema,
  PhotoDumpResponseSchema,
  AutotagWardrobeBodySchema,
  AutotagWardrobeResponseSchema,
  CareOcrBodySchema,
  CareOcrResponseSchema,
  DryCleanActionResponseSchema,
  DryCleanDropOffBodySchema,
  FromPurchasesBodySchema,
  GoesWithResponseSchema,
  ImportablePurchasesResponseSchema,
  MissingPieceReportSchema,
  SeasonalSwapBodySchema,
  SeasonalSwapResponseSchema,
  ShoeBagRotationResponseSchema,
  UpdateWardrobeItemBodySchema,
  WardrobeListResponseSchema,
  WardrobeTryonResponseSchema,
  WardrobeItemSchema,
  WearPhotoUploadResponseSchema,
  WearResponseSchema,
  applyLend,
  applyLendReturn,
  applyLentOverdueAction,
  applyLaundryRuleAfterWear,
  applyPhotoDumpTriageTags,
  canUndoPhotoDumpTriage,
  canUndoWearLog,
  careRulesOrNull,
  detectMissingLayers,
  extractOcrPlainText,
  isLentOverdue,
  isRewearStreakMilestone,
  laundryBasketItemIds,
  LentOverdueActionBodySchema,
  LentOverdueActionResponseSchema,
  parseCareLabel,
  rewearStreakCelebrateCopy,
  sortLentByDueAsc,
  undoPhotoDumpTriageTags,
  WEAR_LOG_UNDO_WINDOW_MS,
  LendActionResponseSchema,
  LendBodySchema,
  LentListResponseSchema,
  CreateRepairLogBodySchema,
  RepairLogSchema,
  RepairLogsResponseSchema,
  validateCreateRepairLog,
  type DuplicateWarning,
  type PhotoDumpBody,
  type LentOverdueActionBody,
  type LaundryRulesPrefs,
  type PhotoDumpTriageDecision,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { audit } from "../lib/audit.js";
import { trackServerEvent } from "../lib/analytics.js";
import {
  DEFAULT_CAPSULE_MAX,
  normalizeCapsuleItemIds,
  readCapsuleItemIds,
} from "../lib/capsule.js";
import { createAccessoryCategory, isAccessoryCategory } from "../lib/outfit-accessories.js";
import { categorySlot, rankGoesWith } from "../lib/outfit-goes-with.js";
import { detectMissingPieces } from "../lib/missing-piece.js";
import {
  appendLentWasteNote,
  clearPhotoDumpTriageAt,
  dismissMissingLayer,
  getLaundryRules,
  getPhotoDumpTriageAt,
  listDismissedMissingLayers,
  setLaundryRules,
  setPhotoDumpTriageAt,
} from "../lib/closet-ops-prefs.js";
import { planSeasonalSwap, withSeasonTag } from "../lib/seasonal-swap.js";
import { suggestShoeBagRotation } from "../lib/shoe-bag-rotation.js";
import { loadRewearStreak } from "../lib/rewear-streak.js";
import {
  applyDryCleanCancel,
  applyDryCleanConfirm,
  applyDryCleanDropOff,
} from "../lib/dry-clean.js";
import { scheduleDryCleanPickup } from "../lib/dry-clean-jobs.js";
import { scheduleLentOverdueNudge } from "../lib/borrow-lent-jobs.js";
import { decodeCursor, InvalidCursorError } from "../lib/paging.js";
import { enqueueJob, jobIdFrom } from "../lib/queues/enqueue.js";
import { renderProviderAvailable } from "../lib/render/provider.js";
import type { CreateWardrobeItemInput, WardrobeItemRecord } from "../lib/repositories/types.js";
import { isUserObjectKey, userObjectKey } from "../lib/storage/r2.js";
import {
  handleWardrobeTryon,
  RENDER_CLAIM_STALE_MS,
  WARDROBE_TRYON_QUEUE,
} from "../jobs/wardrobe-tryon.js";
import {
  WARDROBE_DISCARD_PURGE_DELAY_MS,
  WARDROBE_DISCARD_PURGE_QUEUE,
} from "../jobs/wardrobe-discard-purge.js";
import {
  createVisionTagClientFromEnv,
  needsAutoTag,
  resolvePlaceholderIds,
  tagBatch,
  withDuplicateCheck,
} from "../lib/wardrobe-vision.js";
import { runPhotoDump } from "../lib/photo-dump.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

/** POST /wardrobe/upload form fields. */
const UploadFieldsSchema = z.object({
  category: z.string().trim().min(1).max(100),
  colors: z.array(z.string().max(50)).max(20),
  brand: z.string().max(100).nullable(),
  costMinor: z.number().int().nonnegative().max(1_000_000_000),
});

const OCR_UNAVAILABLE = { error: "ocr_unavailable", message: "Couldn't read the tag right now. Try again later." };

/** A key this user's uploads made: `u/{userId}/…`, or the older `{area}/{userId}/…` keys. */
function ownsStorageKey(key: string, userId: string): boolean {
  if (isUserObjectKey(key, userId)) return true;
  const parts = key.split("/");
  return parts.length === 3 && ["wardrobe", "care-tags", "wear"].includes(parts[0]!) && parts[1] === userId;
}

/** 404 body when a client-sent storage key isn't one of the caller's uploads (checked before any storage call). */
function foreignKeyError(userId: string, keys: Array<string | null | undefined>) {
  return keys.some((k) => k != null && !ownsStorageKey(k, userId))
    ? { error: "Not Found", message: "Image not found" }
    : null;
}

const itemKeys = (b: { imageKeys?: string[] | null; garmentImageKey?: string | null }) => [
  ...(b.imageKeys ?? []),
  b.garmentImageKey,
];

function toWardrobeJson(r: any, imageUrls: string[], garmentImageUrl: string | null) {
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

export const wardrobeRoutes: FastifyPluginAsyncZod = async (app) => {
  async function signedWardrobeJson(r: WardrobeItemRecord) {
    const imageUrls = await mapLimit(r.imageKeys ?? [], 4, (k) => app.deps.storage.getSignedUrl(k));
    const garmentImageUrl = r.garmentImageKey ? await app.deps.storage.getSignedUrl(r.garmentImageKey) : null;
    return toWardrobeJson(r, imageUrls, garmentImageUrl);
  }

  /** The 404 body when a purchase item or closet profile named isn't the caller's, else null. */
  async function foreignRefError(
    userId: string,
    purchaseItemIds: Array<string | null | undefined>,
    profileIds: Array<string | null | undefined>,
  ): Promise<{ error: string; message: string } | null> {
    const profiles = [...new Set(profileIds.filter((v): v is string => Boolean(v)))];
    if (profiles.length > 0) {
      const owned = new Set((await app.deps.repos.listClosetProfiles(userId)).map((p) => p.id));
      if (profiles.some((id) => !owned.has(id))) {
        return { error: "Not Found", message: "Closet profile not found" };
      }
    }
    const items = [...new Set(purchaseItemIds.filter((v): v is string => Boolean(v)))];
    const ownerByPurchase = new Map<string, Promise<string | null>>();
    const owned = await mapLimit(items, 8, async (id) => {
      const pi = await app.deps.repos.findMerchantPurchaseItemById(id);
      if (!pi) return false;
      let owner = ownerByPurchase.get(pi.purchaseId);
      if (!owner) {
        owner = app.deps.repos.findMerchantPurchaseById(pi.purchaseId).then((p) => p?.userId ?? null);
        ownerByPurchase.set(pi.purchaseId, owner);
      }
      return (await owner) === userId;
    });
    return owned.every(Boolean) ? null : { error: "Not Found", message: "Purchase item not found" };
  }

  app.get(
    "/wardrobe",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        querystring: PageQuerySchema.extend({
          /** N27 — scope to closet profile. */
          profileId: z.string().uuid().optional(),
        }),
        response: { 200: WardrobeListResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const q = request.query as { limit: number; cursor?: string; profileId?: string };
      let after;
      try {
        after = decodeCursor(q.cursor);
      } catch (err) {
        if (err instanceof InvalidCursorError) return reply.code(400).send(err.body);
        throw err;
      }
      const page = await app.deps.repos.listWardrobeItemsPage(userId, {
        limit: q.limit,
        after,
        profileId: q.profileId,
      });
      const items = await mapLimit(page.items, 8, signedWardrobeJson);
      trackServerEvent("wardrobe_item_viewed", { userId, profileId: q.profileId ?? null });
      return { items, nextCursor: page.nextCursor };
    },
  );

  /** N25 — list lent items; due=overdue|due|all. */
  app.get(
    "/wardrobe/lent",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        querystring: PageQuerySchema.extend({
          due: z.enum(["all", "due", "overdue"]).optional().default("all"),
          asOf: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        }),
        response: {
          200: LentListResponseSchema.extend({ nextCursor: z.string().nullable().optional() }),
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const q = request.query as {
        limit: number;
        cursor?: string;
        due?: "all" | "due" | "overdue";
        asOf?: string;
      };
      let after;
      try {
        after = decodeCursor(q.cursor);
      } catch (err) {
        if (err instanceof InvalidCursorError) return reply.code(400).send(err.body);
        throw err;
      }
      const user = await app.deps.repos.findUserById(userId);
      const asOf = q.asOf ?? localDateKey(new Date(), resolveTimeZone(user?.timeZone));
      const filter = q.due ?? "all";
      const page = await app.deps.repos.listWardrobeItemsPage(userId, {
        limit: q.limit,
        after,
        lent: { filter, asOf },
      });
      // Pages follow the keyset order; within a page the soonest due come first.
      const items = await mapLimit(sortLentByDueAsc(page.items), 8, signedWardrobeJson);
      return { asOf, filter, items, nextCursor: page.nextCursor };
    },
  );

  /** C4 — one patch on many of the caller's items, all or nothing. */
  app.patch(
    "/wardrobe/items",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: BulkUpdateWardrobeItemsBodySchema,
        response: {
          200: BulkUpdateWardrobeItemsResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { ids, patch } = request.body as { ids: string[]; patch: any };
      const keyError = foreignKeyError(userId, itemKeys(patch));
      if (keyError) return reply.code(404).send(keyError);
      const refError = await foreignRefError(userId, [], [patch.profileId]);
      if (refError) return reply.code(404).send(refError);
      const updated = await app.deps.repos.updateWardrobeItems(userId, ids, patch);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      audit(app.log, "wardrobe.item.updated", { userId, count: updated.length, patch: Object.keys(patch) });
      return { items: await mapLimit(updated, 8, signedWardrobeJson) };
    },
  );

  app.post(
    "/wardrobe",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: CreateWardrobeItemBodySchema,
        response: { 201: WardrobeItemSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as any;
      const keyError = foreignKeyError(userId, itemKeys(body));
      if (keyError) return reply.code(404).send(keyError);
      const refError = await foreignRefError(userId, [body.purchaseItemId], [body.profileId]);
      if (refError) return reply.code(404).send(refError);
      const category = isAccessoryCategory(body.category)
        ? createAccessoryCategory(body.category)
        : body.category;
      const item = await app.deps.repos.createWardrobeItem({
        userId,
        source: body.source ?? "MANUAL",
        category,
        colors: body.colors ?? [],
        brand: body.brand ?? null,
        costMinor: body.costMinor ?? 0,
        imageKeys: body.imageKeys ?? [],
        garmentImageKey: body.garmentImageKey ?? null,
        purchaseItemId: body.purchaseItemId ?? null,
        laundryStatus: body.laundryStatus ?? "CLEAN",
        closetStatus: body.closetStatus ?? "ACTIVE",
        tags: body.tags ?? [],
        profileId: body.profileId ?? null,
      });
      audit(app.log, "wardrobe.item.created", { userId, itemId: item.id });
      trackServerEvent("wardrobe_item_added", { userId, itemId: item.id, category: item.category });
      const imageUrls = await Promise.all((item.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)));
      const garmentImageUrl = item.garmentImageKey ? await app.deps.storage.getSignedUrl(item.garmentImageKey) : null;
      return reply.code(201).send(toWardrobeJson(item, imageUrls, garmentImageUrl));
    },
  );

  /** N23 — bulk mark ACTIVE/STORED by season tag. */
  app.post(
    "/wardrobe/seasonal-swap",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: SeasonalSwapBodySchema,
        response: { 200: SeasonalSwapResponseSchema, 401: ErrorSchema, 409: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as { season: "summer" | "winter" | "monsoon"; tagItemIds?: string[] };
      let items = await app.deps.repos.listWardrobeItems(userId);

      if (body.tagItemIds?.length) {
        const tagSet = new Set(body.tagItemIds);
        // Each item gets its own tag list, so these stay single updates, four at a time.
        const tagged = await mapLimit(
          items.filter((it) => tagSet.has(it.id)),
          4,
          (it) => app.deps.repos.updateWardrobeItem(it.id, userId, { tags: withSeasonTag(it.tags ?? [], body.season) }),
        );
        const taggedById = new Map(tagged.filter((t) => t !== null).map((t) => [t.id, t]));
        items = items.map((it) => taggedById.get(it.id) ?? it);
      }

      const patches = planSeasonalSwap(items, body.season);
      const byId = new Map(items.map((i) => [i.id, i]));
      const updatedItems: WardrobeItemRecord[] = [];
      const idsByStatus = new Map<WardrobeItemRecord["closetStatus"], string[]>();
      for (const patch of patches) {
        const cur = byId.get(patch.id);
        if (!cur) continue;
        if ((cur.closetStatus ?? "ACTIVE") === patch.closetStatus) {
          updatedItems.push(cur);
          continue;
        }
        idsByStatus.set(patch.closetStatus, [...(idsByStatus.get(patch.closetStatus) ?? []), patch.id]);
      }
      // One update per target status.
      for (const [closetStatus, ids] of idsByStatus) {
        const rows = await app.deps.repos.updateWardrobeItems(userId, ids, { closetStatus });
        if (!rows) {
          return reply.code(409).send({ error: "Conflict", message: "Your closet changed; try the swap again" });
        }
        updatedItems.push(...rows);
      }

      const withUrls = await mapLimit(updatedItems, 8, signedWardrobeJson);
      const active = patches.filter((p) => p.closetStatus === "ACTIVE").length;
      const stored = patches.filter((p) => p.closetStatus === "STORED").length;
      trackServerEvent("wardrobe_seasonal_swap", { userId, season: body.season, active, stored });
      return {
        season: body.season,
        updated: patches.length,
        active,
        stored,
        items: withUrls,
      };
    },
  );

  /** N29 — shoe & bag rotation suggestions from wear_log. */
  app.get(
    "/wardrobe/rotation",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        querystring: z.object({
          kind: z.enum(["shoes", "bag", "all"]).optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
        }),
        response: { 200: ShoeBagRotationResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const q = request.query as { kind?: "shoes" | "bag" | "all"; limit?: number };
      const items = await app.deps.repos.listWardrobeItems(userId);
      // Rotation looks at the recent past only: the last 90 days, bounded.
      const wearLogs = await app.deps.repos.listWearLogs(userId, {
        since: new Date(Date.now() - 90 * 86_400_000),
        limit: 2_000,
      });
      const outfits = await app.deps.repos.listOutfits(userId, { limit: 500 });
      const suggestions = suggestShoeBagRotation(
        items.map((it) => ({
          id: it.id,
          category: it.category,
          brand: it.brand,
          colors: it.colors,
        })),
        wearLogs.map((l: any) => ({
          wardrobeItemId: l.wardrobeItemId,
          outfitId: l.outfitId,
          wornOn: l.wornOn,
        })),
        {
          kind: q.kind ?? "all",
          limit: q.limit ?? 10,
          outfits: outfits.map((o: any) => ({ id: o.id, itemIds: o.itemIds ?? [] })),
        },
      );
      trackServerEvent("wardrobe_shoe_bag_rotation", {
        userId,
        count: suggestions.length,
        kind: q.kind ?? "all",
      });
      return {
        suggestions: suggestions.map((s) => ({ ...s, brand: s.brand ?? null, colors: s.colors ?? [] })),
      };
    },
  );

  /** N31 — missing-piece detector → shopping list with affiliate links. */
  app.get(
    "/wardrobe/missing-pieces",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(20).optional(),
        }),
        response: { 200: MissingPieceReportSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const limit = (request.query as { limit?: number }).limit ?? 8;
      const items = await app.deps.repos.listWardrobeItems(userId);
      const report = detectMissingPieces(
        items.map((it) => ({
          id: it.id,
          category: it.category,
          colors: it.colors,
          brand: it.brand,
        })),
        { limit },
      );
      trackServerEvent("wardrobe_missing_pieces", {
        userId,
        gapCount: report.gaps.length,
      });
      return report;
    },
  );

  /** N32 — capsule builder: define N-item core set preferred by outfit generator. */
  app.get(
    "/wardrobe/capsule",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        response: { 200: CapsuleResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const user = await app.deps.repos.findUserById(userId);
      const itemIds = readCapsuleItemIds(user?.prefs);
      const found = itemIds.length > 0 ? await app.deps.repos.findWardrobeItemsByIds(userId, itemIds) : [];
      const byId = new Map(found.map((it) => [it.id, it]));
      const items = await mapLimit(
        itemIds.map((id) => byId.get(id)).filter((r) => r !== undefined),
        8,
        signedWardrobeJson,
      );
      return {
        itemIds: items.map((i: { id: string }) => i.id),
        maxN: DEFAULT_CAPSULE_MAX,
        items,
      };
    },
  );

  app.put(
    "/wardrobe/capsule",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: CapsuleBodySchema,
        response: { 200: CapsuleResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as { itemIds: string[]; maxN?: number };
      const maxN = body.maxN ?? DEFAULT_CAPSULE_MAX;
      const normalized = normalizeCapsuleItemIds(body.itemIds, maxN);
      const owned = normalized.length > 0 ? await app.deps.repos.findWardrobeItemsByIds(userId, normalized) : [];
      const byId = new Map(owned.map((it) => [it.id, it]));
      const invalid = normalized.filter((id) => !byId.has(id));
      if (invalid.length > 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `Unknown wardrobe item(s): ${invalid.slice(0, 3).join(", ")}`,
        });
      }
      // C2: only this key changes; other prefs are left alone.
      await app.deps.repos.patchUserPrefs(userId, { capsuleItemIds: normalized });
      audit(app.log, "wardrobe.capsule.updated", { userId, count: normalized.length });
      trackServerEvent("wardrobe_capsule_updated", { userId, count: normalized.length });
      const items = await mapLimit(normalized, 8, (id) => signedWardrobeJson(byId.get(id)!));
      return { itemIds: normalized, maxN, items };
    },
  );

  app.get(
    "/wardrobe/importable-purchases",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        response: { 200: ImportablePurchasesResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const purchases = await app.deps.repos.listMerchantPurchases(userId);
      const wardrobe = await app.deps.repos.listWardrobeItems(userId);
      const linked = new Set(
        wardrobe.filter((i: any) => i.purchaseItemId).map((i: any) => i.purchaseItemId as string),
      );
      const purchaseIds = purchases.map((p: any) => p.id as string);
      const byPurchase =
        (await app.deps.repos.listMerchantPurchaseItemsByPurchaseIds?.(purchaseIds)) ??
        new Map(
          (await Promise.all(
            purchases.map(async (p: { id: string }) => {
              const items = await app.deps.repos.listMerchantPurchaseItems(p.id);
              return [p.id, items] as const;
            }),
          )) as Array<readonly [string, Awaited<ReturnType<typeof app.deps.repos.listMerchantPurchaseItems>>]>,
        );
      const pairs = purchases.flatMap((p) => ((byPurchase.get(p.id) ?? []) as any[]).map((pi) => ({ p, pi })));
      const imageUrls = await mapLimit(pairs, 8, ({ pi }) =>
        pi.imageKey ? app.deps.storage.getSignedUrl(pi.imageKey) : Promise.resolve(null),
      );
      const items = pairs.map(({ p, pi }, i) => ({
        purchaseItemId: pi.id,
        purchaseId: p.id,
        merchant: p.merchant,
        title: pi.title,
        category: pi.category ?? null,
        brand: pi.brand ?? p.merchant ?? null,
        priceMinor: pi.priceMinor ?? 0,
        imageKey: pi.imageKey ?? null,
        imageUrl: imageUrls[i],
        alreadyInWardrobe: linked.has(pi.id),
      }));
      return { items };
    },
  );

  app.post(
    "/wardrobe/autotag",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: AutotagWardrobeBodySchema,
        response: { 200: AutotagWardrobeResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as {
        images: Array<{
          imageKey: string;
          labels?: string[];
          text?: string | null;
          titleHint?: string | null;
        }>;
      };
      const keyError = foreignKeyError(userId, body.images.map((img) => img.imageKey));
      if (keyError) return reply.code(404).send(keyError);
      const existing = await app.deps.repos.listWardrobeItems(userId);
      const owned = existing.map((i: any) => ({
        id: i.id as string,
        title: [i.brand, i.colors?.[0], i.category].filter(Boolean).join(" "),
        brand: i.brand ?? null,
        category: i.category ?? null,
      }));
      const client = createVisionTagClientFromEnv();
      const visions = await tagBatch(
        client,
        body.images.map((img) => ({ imageKey: img.imageKey, labels: img.labels, text: img.text })),
      );
      const suggestions = [];
      for (const [i, img] of body.images.entries()) {
        const tagged = withDuplicateCheck(visions[i]!, img, owned);
        suggestions.push({
          imageKey: img.imageKey,
          category: tagged.category,
          colors: tagged.colors,
          brand: tagged.brand,
          confidence: tagged.confidence,
          sourceLabels: tagged.sourceLabels,
          duplicateWarnings: tagged.duplicateWarnings,
        });
      }
      trackServerEvent("wardrobe_autotagged", { userId, count: suggestions.length });
      audit(app.log, "wardrobe.autotag", { userId, count: suggestions.length });
      return { suggestions };
    },
  );

  app.post(
    "/wardrobe/bulk",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: BulkCreateWardrobeBodySchema,
        response: { 201: BulkCreateWardrobeResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as { items: any[]; autoTag?: boolean };
      const keyError = foreignKeyError(userId, body.items.flatMap(itemKeys));
      if (keyError) return reply.code(404).send(keyError);
      const refError = await foreignRefError(
        userId,
        body.items.map((entry) => entry.purchaseItemId),
        body.items.map((entry) => entry.profileId),
      );
      if (refError) return reply.code(404).send(refError);
      const existing = await app.deps.repos.listWardrobeItems(userId);
      const owned = existing.map((i: any) => ({
        id: i.id as string,
        title: [i.brand, i.colors?.[0], i.category].filter(Boolean).join(" "),
        brand: i.brand ?? null,
        category: i.category ?? null,
      }));
      const client = body.autoTag ? createVisionTagClientFromEnv() : null;
      const duplicateWarnings: DuplicateWarning[] = [];
      const imageKeyOf = (entry: any): string | null =>
        (entry.garmentImageKey as string | null | undefined) ??
        (Array.isArray(entry.imageKeys) ? entry.imageKeys[0] : null) ??
        null;
      const visions = client
        ? await tagBatch(
            client,
            body.items.map((entry) => {
              const imageKey = imageKeyOf(entry);
              return imageKey &&
                needsAutoTag({ category: entry.category, colors: entry.colors ?? [], brand: entry.brand ?? null })
                ? { imageKey }
                : null;
            }),
          )
        : [];
      const inputs: CreateWardrobeItemInput[] = [];
      const placeholders: string[] = [];
      for (const [i, entry] of body.items.entries()) {
        let category = entry.category;
        let colors = entry.colors ?? [];
        let brand = entry.brand ?? null;
        const vision = visions[i];
        if (vision) {
          const tagged = withDuplicateCheck(vision, { imageKey: imageKeyOf(entry)! }, owned);
          if (needsAutoTag({ category, colors: [], brand: null })) {
            category = tagged.category;
          }
          if (!colors.length && tagged.colors.length) colors = tagged.colors;
          if (!brand && tagged.brand) brand = tagged.brand;
          for (const w of tagged.duplicateWarnings) {
            duplicateWarnings.push(w as DuplicateWarning);
          }
        }
        inputs.push({
          userId,
          source: entry.source ?? "MANUAL",
          category,
          colors,
          brand,
          costMinor: entry.costMinor ?? 0,
          imageKeys: entry.imageKeys ?? [],
          garmentImageKey: entry.garmentImageKey ?? null,
          purchaseItemId: entry.purchaseItemId ?? null,
          laundryStatus: entry.laundryStatus ?? "CLEAN",
          closetStatus: entry.closetStatus ?? "ACTIVE",
          tags: entry.tags ?? [],
          profileId: entry.profileId ?? null,
        });
        // Later rows are checked against this one too, under a placeholder id until it exists.
        const placeholder = randomUUID();
        placeholders.push(placeholder);
        owned.push({
          id: placeholder,
          title: [brand, colors[0], category].filter(Boolean).join(" "),
          brand,
          category,
        });
      }
      // All rows in one transaction; a purchase item already imported comes back as it is.
      const rows = await app.deps.repos.createWardrobeItems(inputs);
      const ids = new Map(placeholders.map((p, i) => [p, rows[i]!.item.id]));
      const created = await mapLimit(rows, 8, (r) => signedWardrobeJson(r.item));
      audit(app.log, "wardrobe.bulk.created", { userId, count: created.length });
      trackServerEvent("wardrobe_bulk_imported", { userId, count: created.length });
      if (body.autoTag) {
        trackServerEvent("wardrobe_autotagged", { userId, count: created.length });
      }
      return reply.code(201).send({
        items: created,
        created: created.length,
        duplicateWarnings: resolvePlaceholderIds(duplicateWarnings, ids),
      });
    },
  );

  /** N55 — photo dump → auto-tagged wardrobe items (pre-human concierge). */
  app.post(
    "/wardrobe/photo-dump",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: PhotoDumpBodySchema,
        response: { 201: PhotoDumpResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as PhotoDumpBody;
      const keyError = foreignKeyError(userId, body.photos.map((p) => p.imageKey));
      if (keyError) return reply.code(404).send(keyError);
      const refError = await foreignRefError(userId, [], [body.profileId]);
      if (refError) return reply.code(404).send(refError);
      const { records, tagged, duplicateWarnings } = await runPhotoDump(app.deps.repos, {
        userId,
        photos: body.photos,
        profileId: body.profileId,
      });
      const items = await mapLimit(records, 8, signedWardrobeJson);
      audit(app.log, "wardrobe.photo_dump", {
        userId,
        count: items.length,
        tagged,
      });
      trackServerEvent("wardrobe_photo_dump", { userId, count: items.length, tagged });
      return reply.code(201).send({
        items,
        created: items.length,
        tagged,
        duplicateWarnings,
      });
    },
  );

  app.post(
    "/wardrobe/from-purchases",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: FromPurchasesBodySchema,
        response: {
          201: BulkCreateWardrobeResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as { purchaseItemIds: string[] };
      const purchaseItemIds = [...new Set(body.purchaseItemIds)];
      const purchases = new Map<string, ReturnType<typeof app.deps.repos.findMerchantPurchaseById>>();
      const found = await mapLimit(purchaseItemIds, 8, async (purchaseItemId) => {
        const pi = await app.deps.repos.findMerchantPurchaseItemById(purchaseItemId);
        if (!pi) return null;
        let purchase = purchases.get(pi.purchaseId);
        if (!purchase) {
          purchase = app.deps.repos.findMerchantPurchaseById(pi.purchaseId);
          purchases.set(pi.purchaseId, purchase);
        }
        const p = await purchase;
        // Only the caller's own purchases; one with no owner is nobody's to import.
        return p?.userId === userId ? { pi, purchase: p } : null;
      });
      const missing = purchaseItemIds.find((_, i) => !found[i]);
      if (missing) {
        return reply.code(404).send({ error: "Not Found", message: `Purchase item not found: ${missing}` });
      }
      // One transaction; an item already imported (also by a concurrent request) comes back as it is.
      const rows = await app.deps.repos.createWardrobeItems(
        found.map((f) => {
          const { pi, purchase } = f!;
          return {
            userId,
            source: "EMAIL" as const,
            category: pi.category ?? pi.title ?? "other",
            colors: [],
            brand: purchase.merchant ?? null,
            costMinor: pi.priceMinor ?? 0,
            imageKeys: pi.imageKey ? [pi.imageKey] : [],
            garmentImageKey: pi.imageKey ?? null,
            purchaseItemId: pi.id,
            laundryStatus: "CLEAN" as const,
          };
        }),
      );
      const createdCount = rows.filter((r) => r.created).length;
      const items = await mapLimit(rows, 8, (r) => signedWardrobeJson(r.item));
      audit(app.log, "wardrobe.from_purchases", { userId, count: createdCount });
      trackServerEvent("wardrobe_from_purchases", { userId, count: createdCount });
      return reply.code(201).send({ items, created: createdCount });
    },
  );

  app.patch(
    "/wardrobe/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        body: UpdateWardrobeItemBodySchema,
        response: { 200: WardrobeItemSchema, 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as any;
      const keyError = foreignKeyError(userId, itemKeys(body));
      if (keyError) return reply.code(404).send(keyError);
      const refError = await foreignRefError(userId, [], [body.profileId]);
      if (refError) return reply.code(404).send(refError);
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, body);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      audit(app.log, "wardrobe.item.updated", { userId, itemId: id, patch: Object.keys(body) });
      trackServerEvent("wardrobe_item_updated", { userId, itemId: id });
      const imageUrls = await Promise.all((updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)));
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      return toWardrobeJson(updated, imageUrls, garmentImageUrl);
    },
  );

  async function applyCareOcrToItem(
    userId: string,
    id: string,
    opts: { imageKey?: string; ocrText?: string },
  ) {
    const existing = await app.deps.repos.findWardrobeItem(id, userId);
    if (!existing) return { error: "not_found" as const };
    // Only a photo the caller uploaded can be attached (and signed back to them).
    if (opts.imageKey && !ownsStorageKey(opts.imageKey, userId)) return { error: "not_found" as const };

    let rawText = (opts.ocrText ?? "").trim();
    let confidence = 0.5;
    if (!rawText && opts.imageKey) {
      let parsed;
      try {
        parsed = await app.deps.ocr.recognize(opts.imageKey);
      } catch (err) {
        // No provider (production), a timeout or a provider error: say so, never a guess.
        app.log.warn({ err, userId, itemId: id }, "care-label OCR unavailable");
        return { error: "ocr_unavailable" as const };
      }
      confidence = parsed.confidence;
      rawText = extractOcrPlainText(parsed.raw, parsed.items);
    }
    if (!rawText) return { error: "no_text" as const };

    const careRules = { ...parseCareLabel(rawText) };
    careRules.confidence = Math.max(careRules.confidence ?? 0, confidence * 0.5);

    const updated = await app.deps.repos.updateWardrobeItem(id, userId, {
      careRules: careRules as unknown as Record<string, unknown>,
      ...(opts.imageKey
        ? {
            imageKeys: Array.from(new Set([...(existing.imageKeys ?? []), opts.imageKey])),
          }
        : {}),
    });
    if (!updated) return { error: "not_found" as const };

    audit(app.log, "wardrobe.care_ocr", { userId, itemId: id });
    trackServerEvent("wardrobe_care_ocr", { userId, itemId: id });
    const imageUrls = await Promise.all(
      (updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
    );
    const garmentImageUrl = updated.garmentImageKey
      ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
      : null;
    return {
      itemId: id,
      careRules,
      confidence: careRules.confidence ?? confidence,
      rawText,
      item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
    };
  }

  /** N20 — snap care/wash tag → structured careRules on item. */
  app.post(
    "/wardrobe/:id/care-ocr",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        body: CareOcrBodySchema,
        response: {
          200: CareOcrResponseSchema.extend({ item: WardrobeItemSchema }),
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as { imageKey?: string; ocrText?: string };
      const result = await applyCareOcrToItem(userId, id, body);
      if ("error" in result) {
        if (result.error === "not_found") {
          return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
        }
        if (result.error === "ocr_unavailable") {
          return reply.code(503).send(OCR_UNAVAILABLE);
        }
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "No care-label text from OCR" });
      }
      return result;
    },
  );

  /** N20 — mobile camera/library multipart snap. */
  app.post(
    "/wardrobe/:id/care-ocr/photo",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        consumes: ["multipart/form-data"],
        response: {
          200: CareOcrResponseSchema.extend({ item: WardrobeItemSchema }),
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }

      let imageKey: string | null = null;
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          if (buffer.length === 0) continue;
          const { key } = await app.deps.storage.put({
            key: userObjectKey(userId, "care-tags", `${randomUUID()}.jpg`),
            body: buffer,
            contentType: (part as { mimetype?: string }).mimetype || "image/jpeg",
          });
          imageKey = key;
        }
      }
      if (!imageKey) {
        return reply.code(400).send({ error: "Bad Request", message: "Care-tag photo required" });
      }

      const result = await applyCareOcrToItem(userId, id, { imageKey });
      if ("error" in result) {
        if (result.error === "not_found") {
          return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
        }
        if (result.error === "ocr_unavailable") {
          return reply.code(503).send(OCR_UNAVAILABLE);
        }
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "No care-label text from OCR" });
      }
      return result;
    },
  );

  /** N22 — drop off at dry cleaner (ticket + pickup → IN_LAUNDRY). */
  app.post(
    "/wardrobe/:id/dry-clean",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        body: DryCleanDropOffBodySchema,
        response: {
          200: DryCleanActionResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as { ticket: string; pickupOn: string };
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const decision = applyDryCleanDropOff(existing, body);
      if (!decision.ok) {
        return reply.code(400).send({ error: "Bad Request", message: decision.error });
      }
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, decision.patch);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }

      const user = await app.deps.repos.findUserById(userId);
      const tz = resolveTimeZone(user?.timeZone);
      const pushScheduled =
        (await scheduleDryCleanPickup({
          userId,
          wardrobeItemId: id,
          ticket: decision.patch.dryCleanTicket!,
          pickupOn: decision.patch.dryCleanPickupOn!,
          category: updated.category,
          timeZone: tz,
        })) === "published";

      audit(app.log, "wardrobe.dry_clean.drop_off", {
        userId,
        itemId: id,
        ticket: body.ticket,
        pickupOn: body.pickupOn,
        pushScheduled,
      });
      trackServerEvent("wardrobe_dry_clean_drop_off", { userId, itemId: id });

      const imageUrls = await Promise.all(
        (updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      return {
        item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
        phase: decision.to,
        pushScheduled,
      };
    },
  );

  /** N22 — confirm pickup → CLEAN. */
  app.post(
    "/wardrobe/:id/dry-clean/confirm",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: DryCleanActionResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const decision = applyDryCleanConfirm(existing);
      if (!decision.ok) {
        return reply.code(400).send({ error: "Bad Request", message: decision.error });
      }
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, decision.patch);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      audit(app.log, "wardrobe.dry_clean.confirm", { userId, itemId: id });
      trackServerEvent("wardrobe_dry_clean_confirm", { userId, itemId: id });
      const imageUrls = await Promise.all(
        (updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      return {
        item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
        phase: decision.to,
        pushScheduled: false,
      };
    },
  );

  /** N22 — cancel drop-off → DIRTY, clear ticket. */
  app.post(
    "/wardrobe/:id/dry-clean/cancel",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: DryCleanActionResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const decision = applyDryCleanCancel(existing);
      if (!decision.ok) {
        return reply.code(400).send({ error: "Bad Request", message: decision.error });
      }
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, decision.patch);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const imageUrls = await Promise.all(
        (updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      return {
        item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
        phase: decision.to,
        pushScheduled: false,
      };
    },
  );

  function toRepairJson(r: {
    id: string;
    userId: string;
    wardrobeItemId: string;
    costMinor: number;
    repairedOn: string;
    kind: string;
    note: string | null;
    tailorOrderId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: r.id,
      userId: r.userId,
      wardrobeItemId: r.wardrobeItemId,
      costMinor: r.costMinor,
      repairedOn: r.repairedOn,
      kind: r.kind as "REPAIR" | "ALTERATION" | "HEM" | "ZIP" | "OTHER",
      note: r.note,
      tailorOrderId: r.tailorOrderId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  // GET /wardrobe/repairs — N21 all repair logs
  app.get(
    "/wardrobe/repairs",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        response: { 200: RepairLogsResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const repairs = await app.deps.repos.listRepairLogs(userId);
      return { repairs: repairs.map(toRepairJson) };
    },
  );

  // GET /wardrobe/:id/repairs — N21 per-item repair log
  app.get(
    "/wardrobe/:id/repairs",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: RepairLogsResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const item = await app.deps.repos.findWardrobeItem(id, userId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const repairs = await app.deps.repos.listRepairLogsByItem(id, userId);
      return { repairs: repairs.map(toRepairJson) };
    },
  );

  // POST /wardrobe/:id/repairs — N21 log repair cost/date (accountant roll-in)
  app.post(
    "/wardrobe/:id/repairs",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        body: CreateRepairLogBodySchema,
        response: {
          201: RepairLogSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const item = await app.deps.repos.findWardrobeItem(id, userId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const validated = validateCreateRepairLog(request.body);
      if (!validated.ok) {
        return reply.code(400).send({ error: "Bad Request", message: validated.error });
      }
      const created = await app.deps.repos.createRepairLog({
        userId,
        wardrobeItemId: id,
        costMinor: validated.costMinor,
        repairedOn: validated.repairedOn,
        kind: validated.kind,
        note: validated.note,
        tailorOrderId: validated.tailorOrderId,
      });
      audit(app.log, "wardrobe.repair_logged", {
        userId,
        itemId: id,
        costMinor: created.costMinor,
        kind: created.kind,
      });
      trackServerEvent("wardrobe_repair_logged", {
        userId,
        itemId: id,
        costMinor: created.costMinor,
        kind: created.kind,
      });
      return reply.code(201).send(toRepairJson(created));
    },
  );

  /** N25 — lend item to someone with due date (+ overdue nudge). */
  app.post(
    "/wardrobe/:id/lend",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        body: LendBodySchema,
        response: {
          200: LendActionResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as { lentTo: string; dueOn: string };
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const decision = applyLend(existing, body);
      if (!decision.ok) {
        return reply.code(400).send({ error: "Bad Request", message: decision.error });
      }
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, decision.patch);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }

      const user = await app.deps.repos.findUserById(userId);
      const tz = resolveTimeZone(user?.timeZone);
      const pushScheduled =
        (await scheduleLentOverdueNudge({
          userId,
          wardrobeItemId: id,
          lentTo: decision.patch.lentTo!,
          dueOn: decision.patch.lentDueOn!,
          category: updated.category,
          timeZone: tz,
        })) === "published";

      const asOf = localDateKey(new Date(), tz);
      audit(app.log, "wardrobe.lend", {
        userId,
        itemId: id,
        lentTo: body.lentTo,
        dueOn: body.dueOn,
        pushScheduled,
      });
      trackServerEvent("wardrobe_lent", { userId, itemId: id });

      const imageUrls = await Promise.all(
        (updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      return {
        item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
        overdue: isLentOverdue(updated, asOf),
        pushScheduled,
      };
    },
  );

  /** N25 — mark lent item returned. */
  app.post(
    "/wardrobe/:id/lend/return",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: LendActionResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const decision = applyLendReturn(existing);
      if (!decision.ok) {
        return reply.code(400).send({ error: "Bad Request", message: decision.error });
      }
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, decision.patch);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      audit(app.log, "wardrobe.lend.return", { userId, itemId: id });
      trackServerEvent("wardrobe_lent_returned", { userId, itemId: id });
      const imageUrls = await Promise.all(
        (updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      return {
        item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
        overdue: false,
        pushScheduled: false,
      };
    },
  );

  app.delete(
    "/wardrobe/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null(), 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const ok = await app.deps.repos.deleteWardrobeItem(id, userId);
      if (!ok) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      audit(app.log, "wardrobe.item.deleted", { userId, itemId: id });
      trackServerEvent("wardrobe_item_deleted", { userId, itemId: id });
      return reply.code(204).send(null);
    },
  );

  /** Ranked “what goes with this?” companions from the user's closet. */
  app.get(
    "/wardrobe/:id/goes-with",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }),
        response: { 200: GoesWithResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const limit = (request.query as { limit?: number }).limit ?? 20;
      const anchor = await app.deps.repos.findWardrobeItem(id, userId);
      if (!anchor) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const all = await app.deps.repos.listWardrobeItems(userId);
      const ranked = rankGoesWith(
        {
          id: anchor.id,
          category: anchor.category,
          colors: anchor.colors,
          brand: anchor.brand,
        },
        all
          .filter((it) => it.id !== anchor.id)
          .map((it) => ({
            id: it.id,
            category: it.category,
            colors: it.colors,
            brand: it.brand,
          })),
        { limit },
      );
      const matches = await Promise.all(
        ranked.map(async (m) => {
          const row = all.find((it) => it.id === m.id)!;
          const imageUrls = await Promise.all((row.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)));
          const garmentImageUrl = row.garmentImageKey
            ? await app.deps.storage.getSignedUrl(row.garmentImageKey)
            : null;
          return {
            ...toWardrobeJson(row, imageUrls, garmentImageUrl),
            score: m.score,
            slot: m.slot,
            reasons: m.reasons,
          };
        }),
      );
      trackServerEvent("wardrobe_goes_with", { userId, itemId: id, matchCount: matches.length });
      return { anchorId: id, matches };
    },
  );

  // Multipart variant for mobile image picker: image file + JSON fields via multipart
  app.post(
    "/wardrobe/upload",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        consumes: ["multipart/form-data"],
        response: { 201: WardrobeItemSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      // parts() yields both files and fields; files() drops field metadata.
      const parts = request.parts();
      let file: { body: Buffer; contentType: string } | null = null;
      const fields: Record<string, string> = {};
      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          if (buffer.length === 0) continue;
          file = { body: buffer, contentType: (part as any).mimetype || "image/jpeg" };
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
      if (!file) {
        return reply.code(400).send({ error: "Bad Request", message: "Image file is required" });
      }
      // Check the fields before anything is stored.
      let colorsJson: unknown = [];
      try {
        colorsJson = fields.colors ? JSON.parse(fields.colors) : [];
      } catch {
        colorsJson = null;
      }
      const parsed = UploadFieldsSchema.safeParse({
        category: fields.category ?? "other",
        colors: colorsJson,
        brand: fields.brand ?? null,
        costMinor: fields.costMinor ? Number(fields.costMinor) : 0,
      });
      if (!parsed.success) {
        return reply.code(400).send({ error: "Bad Request", message: "Invalid item fields" });
      }
      const { category, colors, brand, costMinor } = parsed.data;
      const { key: imageKey } = await app.deps.storage.put({
        key: userObjectKey(userId, "wardrobe", `${randomUUID()}.jpg`),
        body: file.body,
        contentType: file.contentType,
      });
      const item = await app.deps.repos.createWardrobeItem({
        userId,
        source: "MANUAL",
        category,
        colors,
        brand,
        costMinor,
        imageKeys: [imageKey],
        garmentImageKey: imageKey,
      });
      audit(app.log, "wardrobe.item.created", { userId, itemId: item.id });
      trackServerEvent("wardrobe_item_added", { userId, itemId: item.id, category: item.category });
      const imageUrls = await Promise.all((item.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)));
      const garmentImageUrl = item.garmentImageKey ? await app.deps.storage.getSignedUrl(item.garmentImageKey) : null;
      return reply.code(201).send(toWardrobeJson(item, imageUrls, garmentImageUrl));
    },
  );

  app.post(
    "/wardrobe/:id/tryon",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: WardrobeTryonResponseSchema,
          202: WardrobeTryonResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          401: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const item = await app.deps.repos.findWardrobeItem(id, userId);
      if (!item) return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });

      // Cache hit: reuse tryon_previews for user+wardrobe item before paying for render
      const cached = await app.deps.repos.findWardrobeTryonPreview(userId, id);
      if (cached?.status === "READY" && cached.imageKey) {
        const previewUrl = await app.deps.storage.getSignedUrl(cached.imageKey);
        trackServerEvent("wardrobe_tryon_requested", { userId, itemId: id, cached: true });
        return reply.code(200).send({ status: "READY" as const, previewUrl, imageKey: cached.imageKey });
      }

      if (!(item.garmentImageKey ?? item.imageKeys[0])) {
        return reply.code(400).send({ error: "Bad Request", message: "Add a photo of this item to try it on" });
      }
      const avatar = await app.deps.repos.findAvatarByUserId(userId);
      if (!avatar?.referenceImageKey || avatar.status !== "READY") {
        return reply.code(200).send({ status: "NO_AVATAR" as const, previewUrl: null, imageKey: null });
      }
      if (!renderProviderAvailable(app.deps.renderProvider)) {
        return reply.code(503).send({ error: "tryon_unavailable", message: "Try-on is not available right now" });
      }

      // The render runs as a job (C6). One row per (user, item): a READY, a fresh PROCESSING and a
      // FAILED before its retryAfter are not claimed again, so retries and double taps render once.
      const { claimed, preview } = await app.deps.repos.claimWardrobeTryon({
        userId,
        wardrobeItemId: id,
        provider: app.deps.renderProvider.name,
        staleBefore: new Date(Date.now() - RENDER_CLAIM_STALE_MS),
      });
      if (claimed) {
        const payload = { userId, wardrobeItemId: id };
        let queued;
        try {
          queued = await enqueueJob(WARDROBE_TRYON_QUEUE, "render", payload, {
            jobId: jobIdFrom(WARDROBE_TRYON_QUEUE, preview.id, preview.updatedAt.getTime()),
          });
        } catch (err) {
          // Not queued: release the claim so the next ask can try again in a minute.
          await app.deps.repos.finishWardrobeTryon(userId, id, {
            status: "FAILED",
            error: "Could not queue the render",
            retryAfter: new Date(Date.now() + 60_000),
          });
          throw err;
        }
        if (queued.status === "skipped") {
          // Only outside production (enqueueJob throws there without Redis): render in-process.
          void handleWardrobeTryon(payload, app.deps).catch((err) =>
            request.log.error({ err, wardrobeItemId: id }, "in-process wardrobe try-on failed"),
          );
        }
      }

      trackServerEvent("wardrobe_tryon_requested", { userId, itemId: id, cached: false });
      if (preview.status === "READY" && preview.imageKey) {
        const previewUrl = await app.deps.storage.getSignedUrl(preview.imageKey);
        return reply.code(200).send({ status: "READY" as const, previewUrl, imageKey: preview.imageKey });
      }
      if (preview.status === "FAILED") {
        return reply.code(200).send({
          status: "FAILED" as const,
          previewUrl: null,
          imageKey: null,
          retryAfter: preview.retryAfter?.toISOString() ?? null,
        });
      }
      return reply.code(202).send({ status: "PROCESSING" as const, previewUrl: null, imageKey: null });
    },
  );

  /** Upload a wear selfie/photo to R2; pass returned imageKey to POST /wear. */
  app.post(
    "/wear/photo",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        consumes: ["multipart/form-data"],
        response: { 201: WearPhotoUploadResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const parts = request.files();
      let imageKey: string | null = null;
      for await (const part of parts) {
        if (part.type !== "file") continue;
        const buffer = await part.toBuffer();
        if (buffer.length === 0) continue;
        const { key } = await app.deps.storage.put({
          key: userObjectKey(userId, "wear", `${randomUUID()}.jpg`),
          body: buffer,
          contentType: (part as any).mimetype || "image/jpeg",
        });
        imageKey = key;
        break;
      }
      if (!imageKey) {
        return reply.code(400).send({ error: "Bad Request", message: "Image file is required" });
      }
      const imageUrl = await app.deps.storage.getSignedUrl(imageKey);
      return reply.code(201).send({ imageKey, imageUrl });
    },
  );

  app.post(
    "/wear",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: CreateWearBodySchema,
        response: {
          200: WearResponseSchema,
          201: WearResponseSchema,
          401: ErrorSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as any;
      if (!body.wardrobeItemId && !body.outfitId) {
        return reply.code(400).send({ error: "Bad Request", message: "wardrobeItemId or outfitId required" });
      }
      if (body.imageKey && !ownsStorageKey(body.imageKey, userId)) {
        return reply.code(404).send({ error: "Not Found", message: "Wear photo not found" });
      }
      if (body.wardrobeItemId) {
        const item = await app.deps.repos.findWardrobeItem(body.wardrobeItemId, userId);
        if (!item) return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const outfit = body.outfitId ? await app.deps.repos.findOutfitById(body.outfitId, userId) : null;
      if (body.outfitId && !outfit) {
        return reply.code(404).send({ error: "Not Found", message: "Outfit not found" });
      }
      const prevMetric = body.wardrobeItemId
        ? await app.deps.repos.findItemMetric(userId, body.wardrobeItemId)
        : null;
      const { log, created } = await app.deps.repos.createWearLog({
        userId,
        wardrobeItemId: body.wardrobeItemId ?? null,
        outfitId: body.outfitId ?? null,
        wornOn: body.wornOn ? new Date(body.wornOn) : new Date(),
        imageKey: body.imageKey ?? null,
        idempotencyKey: body.idempotencyKey ?? null,
      });
      const toWearJson = (imageUrl: string | null) => ({
        id: log.id,
        userId: log.userId,
        wardrobeItemId: log.wardrobeItemId,
        outfitId: log.outfitId,
        wornOn: log.wornOn.toISOString(),
        imageKey: log.imageKey,
        imageUrl,
        createdAt: log.createdAt.toISOString(),
        undoUntil: new Date(log.createdAt.getTime() + WEAR_LOG_UNDO_WINDOW_MS).toISOString(),
      });
      if (!created) {
        // A retry with the same idempotencyKey: the first log, and nothing counted twice.
        const imageUrl = log.imageKey ? await app.deps.storage.getSignedUrl(log.imageKey) : null;
        return reply.code(200).send(toWearJson(imageUrl));
      }
      trackServerEvent("wear_logged", {
        userId,
        wardrobeItemId: body.wardrobeItemId ?? null,
        outfitId: body.outfitId ?? null,
        hasPhoto: Boolean(body.imageKey),
      });
      if (body.wardrobeItemId) {
        const metric = await app.deps.repos.findItemMetric(userId, body.wardrobeItemId);
        const prev = prevMetric?.wearCount ?? 0;
        const next = metric?.wearCount ?? prev + 1;
        if (prev < 3 && next >= 3) {
          trackServerEvent("wear_challenge_completed", {
            userId,
            wardrobeItemId: body.wardrobeItemId,
            wearCount: next,
          });
        }
      }
      // N53: celebrate rewear-streak milestones after logging a wear.
      try {
        const streak = await loadRewearStreak(app, userId);
        if (isRewearStreakMilestone(streak.currentStreak) && streak.todayLogged) {
          trackServerEvent("rewear_streak_milestone", {
            userId,
            currentStreak: streak.currentStreak,
          });
          await app.deps.push.send({
            userId,
            eventType: "REWEAR_STREAK",
            title: "Rewear streak",
            body: rewearStreakCelebrateCopy(streak.currentStreak),
            link: {
              deepLink: "worn://today",
              screen: "today",
            },
          });
        }
      } catch {
        // streak push is best-effort
      }
      const imageUrl = log.imageKey ? await app.deps.storage.getSignedUrl(log.imageKey) : null;

      // U032 — auto-dirty after wear per laundry rules: one read of the items, one update per status.
      try {
        const rules = await getLaundryRules(app.deps.repos, userId);
        const itemIds = [...new Set([...(body.wardrobeItemId ? [body.wardrobeItemId] : []), ...(outfit?.itemIds ?? [])])];
        const items = itemIds.length > 0 ? await app.deps.repos.findWardrobeItemsByIds(userId, itemIds) : [];
        const metrics = await mapLimit(items, 4, (item) => app.deps.repos.findItemMetric(userId, item.id));
        const idsByStatus = new Map<"CLEAN" | "DIRTY" | "IN_LAUNDRY", string[]>();
        for (const [i, item] of items.entries()) {
          const current = (item.laundryStatus ?? "CLEAN") as "CLEAN" | "DIRTY" | "IN_LAUNDRY";
          const nextStatus = applyLaundryRuleAfterWear({
            current,
            wearCountAfter: metrics[i]?.wearCount ?? 1,
            tags: item.tags,
            rules,
          });
          if (nextStatus !== current) idsByStatus.set(nextStatus, [...(idsByStatus.get(nextStatus) ?? []), item.id]);
        }
        for (const [laundryStatus, ids] of idsByStatus) {
          await app.deps.repos.updateWardrobeItems(userId, ids, { laundryStatus });
        }
      } catch (err) {
        // The wear is logged; a laundry-status miss is reported, not fatal.
        request.log.warn({ err, userId, logId: log.id }, "laundry rule after wear failed");
      }

      return reply.code(201).send(toWearJson(imageUrl));
    },
  );

  /** U031 — undo wear log within 10 minutes. */
  app.delete(
    "/wear/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            ok: z.literal(true),
            id: z.string().uuid(),
          }),
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const existing = await app.deps.repos.findWearLog(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wear log not found" });
      }
      if (!canUndoWearLog(existing.createdAt)) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Undo window expired (10 minutes)" });
      }
      const deleted = await app.deps.repos.deleteWearLog(id, userId);
      if (!deleted) {
        return reply.code(404).send({ error: "Not Found", message: "Wear log not found" });
      }
      audit(app.log, "wear.undone", { userId, wearLogId: id });
      trackServerEvent("wear_log_undone", { userId, wearLogId: id });
      return { ok: true as const, id };
    },
  );

  /** U032 — laundry rule settings. */
  app.get(
    "/wardrobe/laundry-rules",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        response: {
          200: z.object({
            dirtyAfterWears: z.number().int().positive().nullable(),
            dirtyOnSweatTag: z.boolean(),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => getLaundryRules(app.deps.repos, request.user!.sub),
  );

  app.put(
    "/wardrobe/laundry-rules",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: z.object({
          dirtyAfterWears: z.number().int().positive().max(30).nullable().optional(),
          dirtyOnSweatTag: z.boolean().optional(),
        }),
        response: {
          200: z.object({
            dirtyAfterWears: z.number().int().positive().nullable(),
            dirtyOnSweatTag: z.boolean(),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const body = request.body as Partial<LaundryRulesPrefs>;
      const next = await setLaundryRules(app.deps.repos, userId, body);
      audit(app.log, "wardrobe.laundry_rules", { userId, ...next });
      trackServerEvent("laundry_rules_updated", { userId });
      return next;
    },
  );

  /** U032 — batch mark clean. */
  app.post(
    "/wardrobe/laundry/batch-clean",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: z.object({
          itemIds: z.array(z.string().uuid()).min(1).max(50).optional(),
        }),
        response: {
          200: z.object({ cleaned: z.number().int().nonnegative(), itemIds: z.array(z.string().uuid()) }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const body = request.body as { itemIds?: string[] };
      const all = await app.deps.repos.listWardrobeItems(userId);
      const targets = new Set(body.itemIds?.length ? body.itemIds : laundryBasketItemIds(all));
      const cleaned = all
        .filter((item) => targets.has(item.id))
        .filter((item) => item.laundryStatus === "DIRTY" || item.laundryStatus === "IN_LAUNDRY")
        .map((item) => item.id);
      if (cleaned.length > 0) {
        await app.deps.repos.updateWardrobeItems(userId, cleaned, { laundryStatus: "CLEAN" });
      }
      audit(app.log, "wardrobe.laundry_batch_clean", { userId, count: cleaned.length });
      trackServerEvent("laundry_batch_cleaned", { userId, count: cleaned.length });
      return { cleaned: cleaned.length, itemIds: cleaned };
    },
  );

  /** U034 — weather/occasion missing layer shop (1–3). */
  app.get(
    "/wardrobe/missing-layers",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        querystring: z.object({
          tempC: z.coerce.number().optional(),
          condition: z.string().optional(),
          occasion: z
            .enum(["CASUAL", "WORK", "FORMAL", "PARTY", "SPORT", "TRAVEL"])
            .optional(),
        }),
        response: {
          200: z.object({
            gaps: z.array(
              z.object({
                id: z.string(),
                gapReason: z.string(),
                suggestion: z.string(),
                slot: z.enum(["outer", "layer", "shoes", "accessory"]),
                affiliateUrl: z.string(),
              }),
            ),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const q = request.query as {
        tempC?: number;
        condition?: string;
        occasion?: "CASUAL" | "WORK" | "FORMAL" | "PARTY" | "SPORT" | "TRAVEL";
      };
      const items = await app.deps.repos.listWardrobeItems(userId);
      const owned = { outer: 0, layer: 0, shoes: 0, accessory: 0 };
      for (const it of items) {
        const slot = categorySlot(it.category);
        if (slot === "outer") owned.outer += 1;
        else if (slot === "top") owned.layer += 1;
        else if (slot === "shoes") owned.shoes += 1;
        else if (slot === "accessory") owned.accessory += 1;
      }
      const gaps = detectMissingLayers({
        weather: { tempC: q.tempC, condition: q.condition },
        occasion: q.occasion,
        owned,
        dismissedIds: await listDismissedMissingLayers(app.deps.repos, userId),
      });
      return { gaps };
    },
  );

  app.post(
    "/wardrobe/missing-layers/:gapId/dismiss",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ gapId: z.string().min(1).max(64) }),
        response: {
          200: z.object({ dismissedIds: z.array(z.string()) }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const { gapId } = request.params as { gapId: string };
      const dismissedIds = await dismissMissingLayer(app.deps.repos, userId, gapId);
      trackServerEvent("missing_layer_dismissed", { userId, gapId });
      return { dismissedIds };
    },
  );

  /** U039 — overdue enforce: nudge / returned / lost. */
  app.post(
    "/wardrobe/:id/lend/overdue-action",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        body: LentOverdueActionBodySchema,
        response: {
          200: LentOverdueActionResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as LentOverdueActionBody;
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const decision = applyLentOverdueAction(existing, body.action);
      if (!decision.ok) {
        return reply.code(400).send({ error: "Bad Request", message: decision.error });
      }
      if (decision.action === "nudge") {
        audit(app.log, "wardrobe.lend.nudge", { userId, itemId: id });
        trackServerEvent("wardrobe_lent_nudged", { userId, itemId: id });
        try {
          await app.deps.push.send({
            userId,
            eventType: "LENT_OVERDUE",
            title: "Lent item reminder",
            body: decision.message,
            link: { deepLink: "worn://wardrobe", screen: "wardrobe" },
          });
        } catch {
          // best-effort
        }
        return { action: "nudge" as const, message: decision.message };
      }
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, decision.patch);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      let wasteNote: string | null = null;
      if (decision.action === "lost") {
        wasteNote = decision.wasteNote;
        appendLentWasteNote(userId, decision.wasteNote);
        audit(app.log, "wardrobe.lend.lost", { userId, itemId: id, wasteNote });
        trackServerEvent("wardrobe_lent_lost", { userId, itemId: id });
      } else {
        audit(app.log, "wardrobe.lend.return", { userId, itemId: id });
        trackServerEvent("wardrobe_lent_returned", { userId, itemId: id });
      }
      const imageUrls = await Promise.all(
        (updated.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      return {
        action: decision.action,
        item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
        wasteNote,
        overdue: false,
      };
    },
  );

  /** U040 — photo-dump triage decision. */
  app.post(
    "/wardrobe/:id/photo-dump/triage",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          decision: z.enum(["keep", "wardrobe", "discard"]),
        }),
        response: {
          200: z.object({
            decision: z.enum(["keep", "wardrobe", "discard"]),
            item: WardrobeItemSchema.nullable(),
            deleted: z.boolean(),
            undoUntil: z.string().datetime().nullable(),
          }),
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const { decision } = request.body as { decision: PhotoDumpTriageDecision };
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      if (!(existing.tags ?? []).includes("photo-dump")) {
        return reply.code(400).send({ error: "Bad Request", message: "Not a photo-dump item" });
      }
      const decidedAt = new Date();
      setPhotoDumpTriageAt(id, decidedAt.toISOString());
      audit(app.log, "wardrobe.photo_dump.triage", { userId, itemId: id, decision });
      trackServerEvent("photo_dump_triaged", { userId, itemId: id, decision });

      const undoUntil = new Date(decidedAt.getTime() + PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS).toISOString();
      if (decision === "discard") {
        // Hidden now, deleted by a delayed job once the undo window has passed. The job goes first so a
        // discarded item never lacks one; on 503 nothing is hidden and the client can retry.
        const queued = await enqueueJob(
          WARDROBE_DISCARD_PURGE_QUEUE,
          "purge",
          { userId, wardrobeItemId: id },
          {
            delay: WARDROBE_DISCARD_PURGE_DELAY_MS,
            jobId: jobIdFrom(WARDROBE_DISCARD_PURGE_QUEUE, id, decidedAt.getTime()),
          },
        );
        if (queued.status === "skipped") {
          request.log.warn({ userId, itemId: id }, "no job queue: discarded item stays hidden until purged");
        }
        await app.deps.repos.discardWardrobeItem(id, userId);
        return { decision, item: null, deleted: true, undoUntil };
      }
      const tags = applyPhotoDumpTriageTags(existing.tags, decision);
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, { tags });
      if (!updated) return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      return {
        decision,
        item: await signedWardrobeJson(updated),
        deleted: false,
        undoUntil,
      };
    },
  );

  app.post(
    "/wardrobe/:id/photo-dump/triage/undo",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.literal(true), item: WardrobeItemSchema }),
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      // A discard is undone from the row itself, so it works on any instance and after a restart.
      const restored = await app.deps.repos.restoreWardrobeItem(
        id,
        userId,
        new Date(Date.now() - PHOTO_DUMP_TRIAGE_UNDO_WINDOW_MS),
      );
      let updated = restored;
      if (!restored) {
        const at = getPhotoDumpTriageAt(id);
        if (!at || !canUndoPhotoDumpTriage(at)) {
          return reply.code(400).send({ error: "Bad Request", message: "Triage undo window expired" });
        }
        const existing = await app.deps.repos.findWardrobeItem(id, userId);
        if (!existing) {
          return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
        }
        updated = await app.deps.repos.updateWardrobeItem(id, userId, { tags: undoPhotoDumpTriageTags(existing.tags) });
      } else {
        updated = await app.deps.repos.updateWardrobeItem(id, userId, { tags: undoPhotoDumpTriageTags(restored.tags) });
      }
      if (!updated) return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      clearPhotoDumpTriageAt(id);
      audit(app.log, "wardrobe.photo_dump.triage_undo", { userId, itemId: id });
      trackServerEvent("photo_dump_triage_undone", { userId, itemId: id });
      return { ok: true as const, item: await signedWardrobeJson(updated) };
    },
  );
};
