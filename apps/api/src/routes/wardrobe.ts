/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import {
  CapsuleBodySchema,
  CapsuleResponseSchema,
  CreateWardrobeItemBodySchema,
  CreateWearBodySchema,
  BulkCreateWardrobeBodySchema,
  BulkCreateWardrobeResponseSchema,
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
  filterByClosetProfile,
  filterLentDue,
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
  withCapsuleInConsent,
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
import { resolveUserTimeZone, localDayKey, DEFAULT_OUTFIT_TZ } from "../lib/wardrobe-jobs.js";
import {
  createVisionTagClientFromEnv,
  needsAutoTag,
  tagImageWithDupes,
} from "../lib/wardrobe-vision.js";
import { runPhotoDump } from "../lib/photo-dump.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

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
  app.get(
    "/wardrobe",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        querystring: z.object({
          /** N27 — scope to closet profile. */
          profileId: z.string().uuid().optional(),
        }),
        response: { 200: WardrobeListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const profileId = (request.query as { profileId?: string }).profileId;
      let items = await app.deps.repos.listWardrobeItems(userId);
      if (profileId) {
        items = filterByClosetProfile(items, profileId);
      }
      const withUrls = await Promise.all(
        items.map(async (r) => {
          const imageUrls = await Promise.all((r.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)));
          const garmentImageUrl = r.garmentImageKey ? await app.deps.storage.getSignedUrl(r.garmentImageKey) : null;
          return toWardrobeJson(r, imageUrls, garmentImageUrl);
        }),
      );
      trackServerEvent("wardrobe_item_viewed", { userId, profileId: profileId ?? null });
      return { items: withUrls };
    },
  );

  /** N25 — list lent items; due=overdue|due|all. */
  app.get(
    "/wardrobe/lent",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        querystring: z.object({
          due: z.enum(["all", "due", "overdue"]).optional().default("all"),
          asOf: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
        }),
        response: { 200: LentListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const q = request.query as { due?: "all" | "due" | "overdue"; asOf?: string };
      const user = await app.deps.repos.findUserById(userId);
      const tz = resolveUserTimeZone(user?.consentFlags ?? null) || DEFAULT_OUTFIT_TZ;
      const asOf = q.asOf ?? localDayKey(new Date(), tz);
      const filter = q.due ?? "all";
      const items = await app.deps.repos.listWardrobeItems(userId);
      const matched = sortLentByDueAsc(filterLentDue(items, { asOf, filter }));
      const withUrls = await Promise.all(
        matched.map(async (r) => {
          const imageUrls = await Promise.all(
            (r.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
          );
          const garmentImageUrl = r.garmentImageKey
            ? await app.deps.storage.getSignedUrl(r.garmentImageKey)
            : null;
          return toWardrobeJson(r, imageUrls, garmentImageUrl);
        }),
      );
      return { asOf, filter, items: withUrls };
    },
  );

  app.post(
    "/wardrobe",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wardrobe"],
        body: CreateWardrobeItemBodySchema,
        response: { 201: WardrobeItemSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as any;
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
        response: { 200: SeasonalSwapResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const body = request.body as { season: "summer" | "winter" | "monsoon"; tagItemIds?: string[] };
      let items = await app.deps.repos.listWardrobeItems(userId);

      if (body.tagItemIds?.length) {
        const tagSet = new Set(body.tagItemIds);
        for (const it of items) {
          if (!tagSet.has(it.id)) continue;
          const tags = withSeasonTag(it.tags ?? [], body.season);
          await app.deps.repos.updateWardrobeItem(it.id, userId, { tags });
        }
        items = await app.deps.repos.listWardrobeItems(userId);
      }

      const patches = planSeasonalSwap(items, body.season);
      const updatedItems = [];
      for (const patch of patches) {
        const cur = items.find((i: any) => i.id === patch.id);
        if (!cur) continue;
        if ((cur.closetStatus ?? "ACTIVE") === patch.closetStatus) {
          updatedItems.push(cur);
          continue;
        }
        const next = await app.deps.repos.updateWardrobeItem(patch.id, userId, {
          closetStatus: patch.closetStatus,
        });
        if (next) updatedItems.push(next);
      }

      const withUrls = await Promise.all(
        updatedItems.map(async (r: any) => {
          const imageUrls = await Promise.all(
            (r.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)),
          );
          const garmentImageUrl = r.garmentImageKey
            ? await app.deps.storage.getSignedUrl(r.garmentImageKey)
            : null;
          return toWardrobeJson(r, imageUrls, garmentImageUrl);
        }),
      );
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
      const wearLogs = (await app.deps.repos.listWearLogs?.(userId)) ?? [];
      const outfits = (await app.deps.repos.listOutfits?.(userId)) ?? [];
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
      const itemIds = readCapsuleItemIds(user?.consentFlags as Record<string, unknown> | null);
      const all = await app.deps.repos.listWardrobeItems(userId);
      const byId = new Map(all.map((it: any) => [it.id, it]));
      const items = await Promise.all(
        itemIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map(async (r: any) => {
            const imageUrls = await Promise.all(
              (r.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)),
            );
            const garmentImageUrl = r.garmentImageKey
              ? await app.deps.storage.getSignedUrl(r.garmentImageKey)
              : null;
            return toWardrobeJson(r, imageUrls, garmentImageUrl);
          }),
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
      const owned = await app.deps.repos.listWardrobeItems(userId);
      const ownedIds = new Set(owned.map((it: { id: string }) => it.id));
      const invalid = normalized.filter((id) => !ownedIds.has(id));
      if (invalid.length > 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `Unknown wardrobe item(s): ${invalid.slice(0, 3).join(", ")}`,
        });
      }
      const user = await app.deps.repos.findUserById(userId);
      const consentFlags = withCapsuleInConsent(
        (user?.consentFlags as Record<string, unknown> | null) ?? {},
        normalized,
        maxN,
      );
      await app.deps.repos.updateUser(userId, { consentFlags });
      audit(app.log, "wardrobe.capsule.updated", { userId, count: normalized.length });
      trackServerEvent("wardrobe_capsule_updated", { userId, count: normalized.length });
      const byId = new Map(owned.map((it: any) => [it.id, it]));
      const items = await Promise.all(
        normalized.map(async (id) => {
          const r = byId.get(id)!;
          const imageUrls = await Promise.all(
            (r.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)),
          );
          const garmentImageUrl = r.garmentImageKey
            ? await app.deps.storage.getSignedUrl(r.garmentImageKey)
            : null;
          return toWardrobeJson(r, imageUrls, garmentImageUrl);
        }),
      );
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
      const items: any[] = [];
      for (const p of purchases) {
        const rows = (byPurchase.get(p.id) ?? []) as any[];
        for (const pi of rows) {
          const imageUrl = pi.imageKey
            ? await app.deps.storage.getSignedUrl(pi.imageKey)
            : null;
          items.push({
            purchaseItemId: pi.id,
            purchaseId: p.id,
            merchant: p.merchant,
            title: pi.title,
            category: pi.category ?? null,
            brand: pi.brand ?? p.merchant ?? null,
            priceMinor: pi.priceMinor ?? 0,
            imageKey: pi.imageKey ?? null,
            imageUrl,
            alreadyInWardrobe: linked.has(pi.id),
          });
        }
      }
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
        response: { 200: AutotagWardrobeResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const body = request.body as {
        images: Array<{
          imageKey: string;
          labels?: string[];
          text?: string | null;
          titleHint?: string | null;
        }>;
      };
      const existing = await app.deps.repos.listWardrobeItems(userId);
      const owned = existing.map((i: any) => ({
        id: i.id as string,
        title: [i.brand, i.colors?.[0], i.category].filter(Boolean).join(" "),
        brand: i.brand ?? null,
        category: i.category ?? null,
      }));
      const client = createVisionTagClientFromEnv();
      const suggestions = [];
      for (const img of body.images) {
        const tagged = await tagImageWithDupes(
          client,
          {
            imageKey: img.imageKey,
            labels: img.labels,
            text: img.text,
            titleHint: img.titleHint,
          },
          owned,
        );
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
        response: { 201: BulkCreateWardrobeResponseSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as { items: any[]; autoTag?: boolean };
      const existing = await app.deps.repos.listWardrobeItems(userId);
      const owned = existing.map((i: any) => ({
        id: i.id as string,
        title: [i.brand, i.colors?.[0], i.category].filter(Boolean).join(" "),
        brand: i.brand ?? null,
        category: i.category ?? null,
      }));
      const client = body.autoTag ? createVisionTagClientFromEnv() : null;
      const created: any[] = [];
      const duplicateWarnings: DuplicateWarning[] = [];
      for (const entry of body.items) {
        let category = entry.category;
        let colors = entry.colors ?? [];
        let brand = entry.brand ?? null;
        const imageKey =
          (entry.garmentImageKey as string | null | undefined) ??
          (Array.isArray(entry.imageKeys) ? entry.imageKeys[0] : null) ??
          null;
        if (client && imageKey && needsAutoTag({ category, colors, brand })) {
          const tagged = await tagImageWithDupes(
            client,
            { imageKey },
            owned,
          );
          if (needsAutoTag({ category, colors: [], brand: null })) {
            category = tagged.category;
          }
          if (!colors.length && tagged.colors.length) colors = tagged.colors;
          if (!brand && tagged.brand) brand = tagged.brand;
          for (const w of tagged.duplicateWarnings) {
            duplicateWarnings.push(w as DuplicateWarning);
          }
        }
        const item = await app.deps.repos.createWardrobeItem({
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
        });
        owned.push({
          id: item.id,
          title: [brand, colors[0], category].filter(Boolean).join(" "),
          brand,
          category,
        });
        const imageUrls = await Promise.all((item.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)));
        const garmentImageUrl = item.garmentImageKey
          ? await app.deps.storage.getSignedUrl(item.garmentImageKey)
          : null;
        created.push(toWardrobeJson(item, imageUrls, garmentImageUrl));
      }
      audit(app.log, "wardrobe.bulk.created", { userId, count: created.length });
      trackServerEvent("wardrobe_bulk_imported", { userId, count: created.length });
      if (body.autoTag) {
        trackServerEvent("wardrobe_autotagged", { userId, count: created.length });
      }
      return reply.code(201).send({
        items: created,
        created: created.length,
        duplicateWarnings,
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
        response: { 201: PhotoDumpResponseSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as PhotoDumpBody;
      const { records, tagged, duplicateWarnings } = await runPhotoDump(app.deps.repos, {
        userId,
        photos: body.photos,
        profileId: body.profileId,
      });
      const items = await Promise.all(
        records.map(async (item) => {
          const imageUrls = await Promise.all(
            (item.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)),
          );
          const garmentImageUrl = item.garmentImageKey
            ? await app.deps.storage.getSignedUrl(item.garmentImageKey)
            : null;
          return toWardrobeJson(item, imageUrls, garmentImageUrl);
        }),
      );
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
        response: { 201: BulkCreateWardrobeResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as { purchaseItemIds: string[] };
      const existing = await app.deps.repos.listWardrobeItems(userId);
      const alreadyLinked = new Set(
        existing.filter((i: any) => i.purchaseItemId).map((i: any) => i.purchaseItemId as string),
      );
      const created: any[] = [];
      for (const purchaseItemId of body.purchaseItemIds) {
        if (alreadyLinked.has(purchaseItemId)) continue;
        const pi = await app.deps.repos.findMerchantPurchaseItemById(purchaseItemId);
        if (!pi) {
          return reply.code(400).send({
            error: "Bad Request",
            message: `Purchase item not found: ${purchaseItemId}`,
          });
        }
        const purchase = await app.deps.repos.findMerchantPurchaseById(pi.purchaseId);
        if (purchase && purchase.userId && purchase.userId !== userId) {
          return reply.code(400).send({
            error: "Bad Request",
            message: `Purchase item not found: ${purchaseItemId}`,
          });
        }
        const imageKeys = pi.imageKey ? [pi.imageKey] : [];
        const item = await app.deps.repos.createWardrobeItem({
          userId,
          source: "EMAIL",
          category: pi.category ?? pi.title ?? "other",
          colors: [],
          brand: purchase?.merchant ?? null,
          costMinor: pi.priceMinor ?? 0,
          imageKeys,
          garmentImageKey: pi.imageKey ?? null,
          purchaseItemId,
          laundryStatus: "CLEAN",
        });
        alreadyLinked.add(purchaseItemId);
        const imageUrls = await Promise.all((item.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)));
        const garmentImageUrl = item.garmentImageKey
          ? await app.deps.storage.getSignedUrl(item.garmentImageKey)
          : null;
        created.push(toWardrobeJson(item, imageUrls, garmentImageUrl));
      }
      audit(app.log, "wardrobe.from_purchases", { userId, count: created.length });
      trackServerEvent("wardrobe_from_purchases", { userId, count: created.length });
      return reply.code(201).send({ items: created, created: created.length });
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

    let rawText = (opts.ocrText ?? "").trim();
    let confidence = 0.5;
    if (!rawText && opts.imageKey) {
      const parsed = await app.deps.ocr.recognize(opts.imageKey);
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
          const key = `care-tags/${userId}/${randomUUID()}.jpg`;
          await app.deps.storage.put({
            key,
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
      const tz = resolveUserTimeZone(user?.consentFlags ?? null);
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
      const tz = resolveUserTimeZone(user?.consentFlags ?? null);
      const pushScheduled =
        (await scheduleLentOverdueNudge({
          userId,
          wardrobeItemId: id,
          lentTo: decision.patch.lentTo!,
          dueOn: decision.patch.lentDueOn!,
          category: updated.category,
          timeZone: tz,
        })) === "published";

      const asOf = localDayKey(new Date(), tz || DEFAULT_OUTFIT_TZ);
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
      let imageKey: string | null = null;
      const fields: Record<string, string> = {};
      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          if (buffer.length === 0) continue;
          const key = `wardrobe/${userId}/${randomUUID()}.jpg`;
          await app.deps.storage.put({ key, body: buffer, contentType: (part as any).mimetype || "image/jpeg" });
          imageKey = key;
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
      // also check body fields if not multipart? fallback
      const category = fields.category ?? "other";
      const colors = fields.colors ? JSON.parse(fields.colors) : [];
      const brand = fields.brand ?? null;
      const costMinor = fields.costMinor ? Number(fields.costMinor) : 0;
      if (!imageKey) {
        return reply.code(400).send({ error: "Bad Request", message: "Image file is required" });
      }
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
        response: { 200: WardrobeTryonResponseSchema, 404: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const item = await app.deps.repos.findWardrobeItem(id, userId);
      if (!item) return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });

      const garmentKey = item.garmentImageKey ?? item.imageKeys[0] ?? null;
      if (!garmentKey) {
        return reply.code(200).send({ status: "PROCESSING" as const, previewUrl: null, imageKey: null });
      }

      // Cache hit: reuse tryon_previews for user+wardrobe item before paying for render
      const cached = await app.deps.repos.findWardrobeTryonPreview(userId, id);
      if (cached?.status === "READY" && cached.imageKey) {
        const previewUrl = await app.deps.storage.getSignedUrl(cached.imageKey);
        trackServerEvent("wardrobe_tryon_requested", { userId, itemId: id, cached: true });
        return reply.code(200).send({ status: "READY" as const, previewUrl, imageKey: cached.imageKey });
      }

      const avatar = await app.deps.repos.findAvatarByUserId(userId);
      const modelImageKey = avatar?.referenceImageKey ?? null;

      let imageKey: string | null = null;
      let previewUrl: string | null = null;
      let costMicros = 0;
      try {
        if (modelImageKey) {
          const result = await app.deps.renderProvider.tryOn({ modelImageKey, garmentImageKey: garmentKey });
          imageKey = result.imageKey;
          costMicros = result.costMicros;
          if (result.imageBytes) {
            await app.deps.storage.put({ key: imageKey, body: Buffer.from(result.imageBytes), contentType: "image/jpeg" });
          }
          previewUrl = await app.deps.storage.getSignedUrl(imageKey);
        } else {
          // No avatar — mock preview using garment itself
          imageKey = `wardrobe-tryon/${userId}/${id}.jpg`;
          previewUrl = await app.deps.storage.getSignedUrl(garmentKey);
        }
      } catch {
        previewUrl = await app.deps.storage.getSignedUrl(garmentKey);
        imageKey = garmentKey;
      }

      if (imageKey) {
        await app.deps.repos.upsertTryonPreview({
          userId,
          listingVariantId: null,
          wardrobeItemId: id,
          imageKey,
          status: "READY",
          provider: app.deps.renderProvider.name,
          costMicros,
        });
      }

      trackServerEvent("wardrobe_tryon_requested", { userId, itemId: id, cached: false });
      return reply.code(200).send({ status: "READY" as const, previewUrl, imageKey });
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
        const key = `wear/${userId}/${randomUUID()}.jpg`;
        await app.deps.storage.put({
          key,
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
        response: { 201: WearResponseSchema, 401: ErrorSchema, 400: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as any;
      if (!body.wardrobeItemId && !body.outfitId) {
        return reply.code(400).send({ error: "Bad Request", message: "wardrobeItemId or outfitId required" });
      }
      if (body.wardrobeItemId) {
        const item = await app.deps.repos.findWardrobeItem(body.wardrobeItemId, userId);
        if (!item) return reply.code(400).send({ error: "Bad Request", message: "Wardrobe item not found" });
      }
      if (body.outfitId) {
        const outfit = await app.deps.repos.findOutfitById(body.outfitId, userId);
        if (!outfit) return reply.code(400).send({ error: "Bad Request", message: "Outfit not found" });
      }
      const prevMetric = body.wardrobeItemId
        ? await app.deps.repos.findItemMetric(userId, body.wardrobeItemId)
        : null;
      const log = await app.deps.repos.createWearLog({
        userId,
        wardrobeItemId: body.wardrobeItemId ?? null,
        outfitId: body.outfitId ?? null,
        wornOn: body.wornOn ? new Date(body.wornOn) : new Date(),
        imageKey: body.imageKey ?? null,
      });
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

      // U032 — auto-dirty after wear per laundry rules
      try {
        const rules = await getLaundryRules(app.deps.repos, userId);
        const itemIds: string[] = [];
        if (body.wardrobeItemId) itemIds.push(body.wardrobeItemId);
        if (body.outfitId) {
          const outfit = await app.deps.repos.findOutfitById(body.outfitId, userId);
          if (outfit) itemIds.push(...outfit.itemIds);
        }
        for (const wid of [...new Set(itemIds)]) {
          const item = await app.deps.repos.findWardrobeItem(wid, userId);
          if (!item) continue;
          const metric = await app.deps.repos.findItemMetric(userId, wid);
          const nextStatus = applyLaundryRuleAfterWear({
            current: (item.laundryStatus ?? "CLEAN") as "CLEAN" | "DIRTY" | "IN_LAUNDRY",
            wearCountAfter: metric?.wearCount ?? 1,
            tags: item.tags,
            rules,
          });
          if (nextStatus !== (item.laundryStatus ?? "CLEAN")) {
            await app.deps.repos.updateWardrobeItem(wid, userId, { laundryStatus: nextStatus });
          }
        }
      } catch {
        // laundry rules are best-effort
      }

      return reply.code(201).send({
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
      const targets = body.itemIds?.length
        ? body.itemIds
        : laundryBasketItemIds(all);
      const cleaned: string[] = [];
      for (const id of targets) {
        const item = await app.deps.repos.findWardrobeItem(id, userId);
        if (!item) continue;
        if (item.laundryStatus !== "DIRTY" && item.laundryStatus !== "IN_LAUNDRY") continue;
        await app.deps.repos.updateWardrobeItem(id, userId, { laundryStatus: "CLEAN" });
        cleaned.push(id);
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

      if (decision === "discard") {
        await app.deps.repos.deleteWardrobeItem(id, userId);
        return {
          decision,
          item: null,
          deleted: true,
          undoUntil: new Date(decidedAt.getTime() + 10 * 60_000).toISOString(),
        };
      }
      const tags = applyPhotoDumpTriageTags(existing.tags, decision);
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, { tags });
      const imageUrls = await Promise.all(
        (updated!.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated!.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated!.garmentImageKey)
        : null;
      return {
        decision,
        item: toWardrobeJson(updated, imageUrls, garmentImageUrl),
        deleted: false,
        undoUntil: new Date(decidedAt.getTime() + 10 * 60_000).toISOString(),
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
      const at = getPhotoDumpTriageAt(id);
      if (!at || !canUndoPhotoDumpTriage(at)) {
        return reply.code(400).send({ error: "Bad Request", message: "Triage undo window expired" });
      }
      const existing = await app.deps.repos.findWardrobeItem(id, userId);
      if (!existing) {
        return reply.code(404).send({ error: "Not Found", message: "Item not found (discard undo requires restore)" });
      }
      const tags = undoPhotoDumpTriageTags(existing.tags);
      const updated = await app.deps.repos.updateWardrobeItem(id, userId, { tags });
      clearPhotoDumpTriageAt(id);
      audit(app.log, "wardrobe.photo_dump.triage_undo", { userId, itemId: id });
      trackServerEvent("photo_dump_triage_undone", { userId, itemId: id });
      const imageUrls = await Promise.all(
        (updated!.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated!.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated!.garmentImageKey)
        : null;
      return { ok: true as const, item: toWardrobeJson(updated, imageUrls, garmentImageUrl) };
    },
  );
};
