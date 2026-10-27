/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import {
  DisposeBodySchema,
  DisposeResponseSchema,
  ReplaceTwinClickBodySchema,
  ReplaceTwinClickResponseSchema,
  ReplaceTwinsResponseSchema,
  RewearStreakSchema,
  WearChallengeStartResponseSchema,
  WasteDeadResponseSchema,
  WasteSummaryResponseSchema,
  buildNeverWornShareCard,
  computeCo2WaterSavings,
  cpwGoalProgress,
  wearChallengeProgress,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { prepareDispositionRails } from "../lib/disposition-marketplace.js";
import { findReplaceTwins } from "../lib/replace-twin.js";
import { declutterPayloadForUser } from "./disposition.js";
import { loadRewearStreak } from "../lib/rewear-streak.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

/** In-process “started” set so progress stays eligible after status flips ACTIVE. */
const startedWearChallenges = new Set<string>();

function challengeKey(userId: string, itemId: string) {
  return `${userId}:${itemId}`;
}

async function signWardrobeItem(app: any, item: any) {
  const imageUrls = await Promise.all((item.imageKeys ?? []).map((k: string) => app.deps.storage.getSignedUrl(k)));
  const garmentImageUrl = item.garmentImageKey ? await app.deps.storage.getSignedUrl(item.garmentImageKey) : null;
  return {
    id: item.id,
    userId: item.userId,
    source: item.source,
    category: item.category,
    colors: item.colors,
    brand: item.brand,
    costMinor: item.costMinor,
    imageKeys: item.imageKeys,
    garmentImageKey: item.garmentImageKey,
    purchaseItemId: item.purchaseItemId,
    laundryStatus: item.laundryStatus ?? "CLEAN",
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    imageUrls,
    garmentImageUrl,
  };
}

function attachWearChallenge(m: {
  wardrobeItemId: string;
  wearCount: number;
  lastWornAt: string | null;
  costPerWearMinor: number | null;
  status: "ACTIVE" | "DORMANT" | "DEAD";
  item?: any;
  started?: boolean;
  targetCpwMinor?: number | null;
}) {
  const targetCpwMinor = m.targetCpwMinor ?? null;
  const costMinor = typeof m.item?.costMinor === "number" ? m.item.costMinor : 0;
  const cpwGoal = cpwGoalProgress(costMinor, m.wearCount, targetCpwMinor);
  return {
    ...m,
    targetCpwMinor,
    cpwGoal: cpwGoal.active ? cpwGoal : undefined,
    wearChallenge: wearChallengeProgress(m.wearCount, m.status, { started: m.started }),
  };
}

export const wasteRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/waste/summary",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["waste"],
        querystring: z.object({
          breakOnPurchase: z
            .enum(["0", "1", "true", "false"])
            .optional()
            .describe("When true, a new merchant purchase resets the rewear streak window"),
        }),
        response: { 200: WasteSummaryResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const q = request.query as { breakOnPurchase?: string };
      const breakOnPurchase = q.breakOnPurchase === "1" || q.breakOnPurchase === "true";
      const metrics = await app.deps.repos.getItemMetrics(userId);
      const withItems = await Promise.all(
        metrics.map(async (m) => {
          const item = await app.deps.repos.findWardrobeItem(m.wardrobeItemId, userId);
          const signed = item ? await signWardrobeItem(app, item) : undefined;
          return attachWearChallenge({
            wardrobeItemId: m.wardrobeItemId,
            wearCount: m.wearCount,
            lastWornAt: m.lastWornAt ? m.lastWornAt.toISOString() : null,
            costPerWearMinor: m.costPerWearMinor,
            status: m.status as "ACTIVE" | "DORMANT" | "DEAD",
            item: signed,
            started: startedWearChallenges.has(challengeKey(userId, m.wardrobeItemId)),
            targetCpwMinor: m.targetCpwMinor ?? null,
          });
        }),
      );
      const totalItems = metrics.length;
      const active = metrics.filter((m) => m.status === "ACTIVE").length;
      const dormant = metrics.filter((m) => m.status === "DORMANT").length;
      const dead = metrics.filter((m) => m.status === "DEAD").length;
      const vals = metrics.map((m) => m.costPerWearMinor).filter((v): v is number => typeof v === "number" && v !== null);
      const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      const neverWornCostMinor = withItems.reduce((sum, m) => {
        if (m.wearCount > 0) return sum;
        const cost = m.item?.costMinor ?? 0;
        return sum + (typeof cost === "number" && cost > 0 ? cost : 0);
      }, 0);
      const neverWornItems = withItems.filter((m) => m.wearCount === 0);
      const shareCard = buildNeverWornShareCard({
        neverWornCostMinor,
        itemCount: neverWornItems.length,
        brands: neverWornItems.map((m) => m.item?.brand ?? m.item?.category ?? null),
        currency: "INR",
      });
      const listings = await app.deps.repos.listDispositionListings(userId);
      const declutter = declutterPayloadForUser(userId, listings);
      const rewearStreak = await loadRewearStreak(app, userId, { breakOnPurchase });
      const co2WaterSavings = computeCo2WaterSavings({
        metrics: metrics.map((m) => ({ wearCount: m.wearCount })),
        rewearStreakDays: rewearStreak.currentStreak,
      });
      trackServerEvent("waste_viewed", { userId, totalItems });
      trackServerEvent("rewear_streak_viewed", {
        userId,
        currentStreak: rewearStreak.currentStreak,
        breakOnPurchase,
      });
      return {
        totalItems,
        active,
        dormant,
        dead,
        avgCostPerWearMinor: avg,
        neverWornCostMinor,
        shareCard,
        rewearStreak,
        co2WaterSavings,
        declutterChallenge: declutter.declutterChallenge,
        declutterShareCard: declutter.declutterShareCard,
        metrics: withItems,
      };
    },
  );

  app.get(
    "/waste/rewear-streak",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["waste"],
        querystring: z.object({
          breakOnPurchase: z.enum(["0", "1", "true", "false"]).optional(),
        }),
        response: { 200: RewearStreakSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const q = request.query as { breakOnPurchase?: string };
      const breakOnPurchase = q.breakOnPurchase === "1" || q.breakOnPurchase === "true";
      const streak = await loadRewearStreak(app, userId, { breakOnPurchase });
      trackServerEvent("rewear_streak_viewed", {
        userId,
        currentStreak: streak.currentStreak,
        breakOnPurchase,
      });
      return streak;
    },
  );

  app.get(
    "/waste/dead",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["waste"],
        response: { 200: WasteDeadResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const metrics = await app.deps.repos.getItemMetrics(userId);
      const dead = metrics.filter((m) => m.status === "DEAD");
      const withItems = await Promise.all(
        dead.map(async (m) => {
          const item = await app.deps.repos.findWardrobeItem(m.wardrobeItemId, userId);
          const signed = item ? await signWardrobeItem(app, item) : undefined;
          return attachWearChallenge({
            wardrobeItemId: m.wardrobeItemId,
            wearCount: m.wearCount,
            lastWornAt: m.lastWornAt ? m.lastWornAt.toISOString() : null,
            costPerWearMinor: m.costPerWearMinor,
            status: m.status as "ACTIVE" | "DORMANT" | "DEAD",
            item: signed,
            started: startedWearChallenges.has(challengeKey(userId, m.wardrobeItemId)),
            targetCpwMinor: m.targetCpwMinor ?? null,
          });
        }),
      );
      return { items: withItems };
    },
  );

  /** N51 — replace worn-out twin via affiliate listings. */
  app.get(
    "/waste/:itemId/replace-twins",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["waste"],
        params: z.object({ itemId: z.string().uuid() }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(20).optional(),
        }),
        response: {
          200: ReplaceTwinsResponseSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { itemId } = request.params;
      const limit = (request.query as { limit?: number }).limit ?? 8;
      const item = await app.deps.repos.findWardrobeItem(itemId, userId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const listings = (await app.deps.repos.listListings({ limit: 100 })).items;
      const candidates = findReplaceTwins(
        {
          id: item.id,
          category: item.category,
          colors: item.colors,
          brand: item.brand,
        },
        listings,
        { limit },
      );
      trackServerEvent("waste_replace_twins", {
        userId,
        wardrobeItemId: itemId,
        count: candidates.length,
      });
      return { wardrobeItemId: itemId, candidates };
    },
  );

  app.post(
    "/waste/:itemId/replace-twins/click",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["waste"],
        params: z.object({ itemId: z.string().uuid() }),
        body: ReplaceTwinClickBodySchema,
        response: {
          200: ReplaceTwinClickResponseSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { itemId } = request.params;
      const body = request.body as {
        listingId: string;
        platform?: string;
        clickId?: string;
      };
      const item = await app.deps.repos.findWardrobeItem(itemId, userId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const listing = await app.deps.repos.findListingById(body.listingId);
      if (!listing) {
        return reply.code(404).send({ error: "Not Found", message: "Listing not found" });
      }
      const clickId = body.clickId ?? `replace-twin:${itemId}:${body.listingId}:${randomUUID()}`;
      const platform = body.platform ?? "other";
      await app.deps.repos.recordCashbackEvent({
        userId,
        listingId: body.listingId,
        platform,
        clickId,
      });
      trackServerEvent("waste_replace_twin_click", {
        userId,
        wardrobeItemId: itemId,
        listingId: body.listingId,
        clickId,
      });
      return {
        recorded: true as const,
        clickId,
        listingId: body.listingId,
        wardrobeItemId: itemId,
      };
    },
  );

  /** Start a “Wear it 3×” challenge; queues a soft nudge push. */
  app.post(
    "/waste/:itemId/challenge",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["waste"],
        params: z.object({ itemId: z.string().uuid() }),
        response: {
          200: WearChallengeStartResponseSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { itemId } = request.params;
      const item = await app.deps.repos.findWardrobeItem(itemId, userId);
      if (!item) return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });

      const metric = await app.deps.repos.findItemMetric(userId, itemId);
      const wearCount = metric?.wearCount ?? 0;
      const status = metric?.status ?? "ACTIVE";
      const challenge = wearChallengeProgress(wearCount, status, { started: true });

      if (challenge.completed) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Wear challenge already completed for this item",
        });
      }

      startedWearChallenges.add(challengeKey(userId, itemId));

      const label = item.brand || item.category;
      await app.deps.push.send({
        userId,
        eventType: "WEAR_CHALLENGE",
        title: "Wear it 3×",
        body: challenge.progress === 0
          ? `Challenge on: wear ${label} three times before you clear it.`
          : `${challenge.label} on ${label} — keep going.`,
        link: {
          deepLink: `worn://wardrobe?item=${itemId}`,
          screen: "wardrobe",
          wardrobeItemId: itemId,
        },
      });

      trackServerEvent("wear_challenge_started", {
        userId,
        wardrobeItemId: itemId,
        progress: challenge.progress,
      });

      return {
        wardrobeItemId: itemId,
        wearChallenge: challenge,
        pushQueued: true,
      };
    },
  );

  app.post(
    "/waste/:itemId/dispose",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["waste"],
        params: z.object({ itemId: z.string().uuid() }),
        body: DisposeBodySchema,
        response: { 200: DisposeResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { itemId } = request.params;
      const body = request.body as any;
      const item = await app.deps.repos.findWardrobeItem(itemId, userId);
      if (!item) return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      const mode = body.mode ?? "SELL";
      const priceMinor = body.priceMinor ?? null;
      const { sellerId } = await prepareDispositionRails(
        app.deps.repos,
        userId,
        item as never,
        mode,
        priceMinor,
        { createSeller: body.createSeller },
      );
      const listing = await app.deps.repos.createDispositionListing({
        userId,
        wardrobeItemId: itemId,
        mode,
        priceMinor,
        sellerId,
      });
      trackServerEvent("waste_disposed", { userId, wardrobeItemId: itemId, mode });
      const all = await app.deps.repos.listDispositionListings(userId);
      const declutter = declutterPayloadForUser(userId, all);
      if (declutter.declutterChallenge.started && declutter.declutterChallenge.completed) {
        trackServerEvent("declutter_challenge_completed", {
          userId,
          target: declutter.declutterChallenge.target,
        });
      }
      return reply.code(200).send({
        listingId: listing.id,
        wardrobeItemId: listing.wardrobeItemId,
        mode: listing.mode,
        status: listing.status,
      });
    },
  );
};
