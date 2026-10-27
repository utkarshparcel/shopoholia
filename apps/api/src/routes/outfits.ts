/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CompleteLookResponseSchema,
  FromCalendarBodySchema,
  FromCalendarResponseSchema,
  GenerateWeekDayBodySchema,
  InterviewKitBodySchema,
  InterviewKitListResponseSchema,
  InterviewKitPatchBodySchema,
  InterviewKitResponseSchema,
  OutfitSchema,
  PatchWeekDayBodySchema,
  TodayOutfitResponseSchema,
  TravelPackBodySchema,
  TravelPackResponseSchema,
  WeddingFestivalBodySchema,
  WeddingFestivalResponseSchema,
  WeekOutfitsResponseSchema,
  WorkwearRotationBodySchema,
  WorkwearRotationResponseSchema,
  isOutfitPinned,
  mapLimit,
  pinConflictWarn,
  resolveTimeZone,
  shouldSkipPinnedOnReroll,
  withOutfitPinned,
} from "@worn/shared";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { requireEntitlement } from "../lib/entitlements.js";
import { trackServerEvent } from "../lib/analytics.js";
import { audit } from "../lib/audit.js";
import {
  planOutfitFromCalendarEvent,
  plannedForFromEvent,
  scheduleCalEventOutfitReminder,
  type OutfitOccasion,
} from "../lib/cal-event-outfit.js";
import {
  applyCapsulePreference,
  preferCapsulePool,
  readCapsuleItemIds,
} from "../lib/capsule.js";
import { buildCompleteLook, detectMissingSlots } from "../lib/complete-look.js";
import {
  createInterviewKitStore,
  scheduleInterviewKitReminder,
} from "../lib/interview-kit.js";
import { QueueUnavailableError } from "../lib/queues/enqueue.js";
import {
  applyAvoidRepeat,
  DEFAULT_AVOID_REPEAT_DAYS,
  recentlyWornItemIds,
} from "../lib/outfit-avoid-repeat.js";
import { attachAccessoriesToOutfit } from "../lib/outfit-accessories.js";
import {
  buildWhyThis,
  isItemClean,
  pickOutfitSlice,
  rankWardrobeItems,
  weatherOccasion,
} from "../lib/outfit-rank.js";
import { toDateKey, weekDayKeys } from "../lib/outfit-week.js";
import { preferActiveCloset } from "../lib/seasonal-swap.js";
import { buildTravelPack } from "../lib/travel-pack.js";
import { planWeddingFestival } from "../lib/wedding-festival.js";
import {
  planWorkwearRotation,
  rotationIsUnique,
} from "../lib/workwear-rotation.js";
import { scheduleMorningOutfit } from "../lib/wardrobe-jobs.js";
import {
  shouldRerollOutfitForWeather,
  weatherFromCtx,
} from "../lib/weather-reroll.js";
import { resolveWeather, type WeatherCtx } from "../lib/weather.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const DAY_MS = 86_400_000;
/** Wear history the generator reads: avoid-repeat and wear counts look no further back. */
export const OUTFIT_HISTORY_DAYS = 60;
const OUTFIT_HISTORY_MAX_LOGS = 2_000;
/** Recent outfits, to turn outfit wear logs into item ids. */
const OUTFIT_HISTORY_MAX_OUTFITS = 500;
/** Listings scanned for complete-the-look fills, 100 per page. */
export const COMPLETE_LOOK_MAX_LISTINGS = 300;

function toOutfitJson(o: any, items?: any[], signedItemMaps?: Map<string, any>, whyThis?: string[]) {
  const itemJsons = items
    ? items.map((r) => {
        const signed = signedItemMaps?.get(r.id);
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
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          imageUrls: signed?.imageUrls ?? [],
          garmentImageUrl: signed?.garmentImageUrl ?? null,
        };
      })
    : undefined;
  const weatherCtx = o.weatherCtx as (Omit<WeatherCtx, "source"> & { source?: string; whyThis?: string[] }) | null;
  // Rows written before C5 can carry invented ("mock") weather: it is never shown.
  const realWeather = weatherCtx?.source === "api";
  const storedReasons = realWeather
    ? weatherCtx?.whyThis
    : weatherCtx?.whyThis?.filter((r) => !r.startsWith("Weather "));
  const reasons = whyThis ?? storedReasons ?? undefined;
  const publicWeather = weatherCtx && realWeather
    ? {
        tempC: weatherCtx.tempC,
        condition: weatherCtx.condition,
        source: weatherCtx.source,
        fetchedAt: weatherCtx.fetchedAt,
        ...(weatherCtx.lat != null ? { lat: weatherCtx.lat } : {}),
      }
    : null;
  return {
    id: o.id,
    userId: o.userId,
    itemIds: o.itemIds,
    occasion: o.occasion,
    weatherCtx: publicWeather,
    whyThis: reasons,
    plannedFor: o.plannedFor ?? null,
    generatedAt: o.generatedAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
    items: itemJsons,
  };
}

/** Outfits with their items: one item query for all of them, and a few presigns at a time. */
async function hydrateOutfits(app: any, userId: string, outfits: any[]) {
  const ids = [...new Set(outfits.flatMap((o) => (o.itemIds ?? []) as string[]))];
  const rows: any[] = ids.length > 0 ? await app.deps.repos.findWardrobeItemsByIds(userId, ids) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const signedMap = new Map();
  await mapLimit(rows, 4, async (r: any) => {
    const imageUrls = await mapLimit((r.imageKeys ?? []) as string[], 4, (k) => app.deps.storage.getSignedUrl(k));
    const garmentImageUrl = r.garmentImageKey ? await app.deps.storage.getSignedUrl(r.garmentImageKey) : null;
    signedMap.set(r.id, { imageUrls, garmentImageUrl });
  });
  return outfits.map((o) => {
    const items = ((o.itemIds ?? []) as string[]).map((id) => byId.get(id)).filter(Boolean);
    return toOutfitJson(o, items, signedMap);
  });
}

async function hydrateOutfit(app: any, userId: string, outfit: any) {
  return (await hydrateOutfits(app, userId, [outfit]))[0]!;
}

/** True when every id is one of the caller's (not discarded) items. */
async function ownsAllItems(app: any, userId: string, itemIds: string[]): Promise<boolean> {
  const unique = [...new Set(itemIds)];
  if (unique.length === 0) return true;
  const found = await app.deps.repos.findWardrobeItemsByIds(userId, unique);
  return found.length === unique.length;
}

/** What the generator reads, loaded once per request and shared by every outfit it makes. */
export type OutfitContext = {
  user: any;
  timeZone: string;
  items: any[];
  wearLogs: any[];
  outfits: any[];
  weather: WeatherCtx | null;
};

async function loadOutfitContext(app: any, userId: string, now: Date = new Date()): Promise<OutfitContext> {
  const [user, items, wearLogs, outfits, weather] = await Promise.all([
    app.deps.repos.findUserById(userId),
    app.deps.repos.listWardrobeItems(userId),
    app.deps.repos.listWearLogs(userId, {
      since: new Date(now.getTime() - OUTFIT_HISTORY_DAYS * DAY_MS),
      limit: OUTFIT_HISTORY_MAX_LOGS,
    }),
    app.deps.repos.listOutfits(userId, { limit: OUTFIT_HISTORY_MAX_OUTFITS }),
    resolveWeather({ lat: 12.97, lon: 77.59, date: now }),
  ]);
  return { user, timeZone: resolveTimeZone(user?.timeZone), items, wearLogs, outfits, weather };
}

export type GenerateOutfitOpts = {
  plannedFor?: string | null;
  avoidRepeatDays?: number;
  now?: Date;
  /** Force upsert even when a planned outfit already exists. */
  replace?: boolean;
  /** Ranked alternative index (0 = primary). */
  altIndex?: number;
  /** Skip the push event and the morning-job scheduling (swipe previews, GET requests). */
  skipPush?: boolean;
  /** Override weather-derived occasion (e.g. calendar event map). */
  occasion?: OutfitOccasion | null;
  /** Extra whyThis hints (e.g. calendar match reason). */
  whyHints?: string[];
  /**
   * W052 — when true, constrain pool to capsule membership.
   * When false, skip capsule restrict/boost. When undefined, prefer capsule (N32 default).
   */
  preferCapsule?: boolean;
  /** Closet, history and weather already loaded for this request (see `loadOutfitContext`). */
  ctx?: OutfitContext;
  /**
   * False returns the outfit without saving it (swipe alternatives): a preview with a fresh id,
   * no row, push or job. Default true.
   */
  persist?: boolean;
};

async function generateOutfitForUser(app: any, userId: string, opts: GenerateOutfitOpts = {}) {
  const ctx = opts.ctx ?? (await loadOutfitContext(app, userId, opts.now));
  const items = ctx.items;
  if (items.length === 0) return null;

  const user = ctx.user;
  const styleProfile = user?.styleProfile ?? null;
  const wearLogs = ctx.wearLogs;
  const allOutfits = ctx.outfits;
  const wearCount = new Map<string, number>();
  for (const log of wearLogs) {
    if (!log.wardrobeItemId) continue;
    wearCount.set(log.wardrobeItemId, (wearCount.get(log.wardrobeItemId) ?? 0) + 1);
  }

  const weather = ctx.weather;
  const altIndex = Math.max(0, opts.altIndex ?? 0);

  // Prefer clean / out-of-laundry items when those fields exist
  const clean = items.filter((it: any) => isItemClean(it));
  let pool = clean.length > 0 ? clean : items;
  const whyHints: string[] = [...(opts.whyHints ?? [])];
  if (clean.length > 0 && clean.length < items.length) {
    whyHints.push("Skipped pieces marked dirty or in laundry");
  }

  // Seasonal swap: prefer ACTIVE closet pieces over STORED
  const seasonal = preferActiveCloset(pool);
  pool = seasonal.pool;
  if (seasonal.applied) {
    whyHints.push(`Skipped ${seasonal.storedCount} stored off-season piece${seasonal.storedCount === 1 ? "" : "s"}`);
  }

  // Avoid-repeat: exclude pieces worn in the last N days
  const avoidDays = opts.avoidRepeatDays ?? DEFAULT_AVOID_REPEAT_DAYS;
  const recentlyWorn = recentlyWornItemIds(wearLogs, {
    days: avoidDays,
    now: opts.now ?? new Date(),
    outfits: allOutfits.map((o: any) => ({ id: o.id, itemIds: o.itemIds ?? [] })),
  });
  const avoided = applyAvoidRepeat(pool, recentlyWorn);
  pool = avoided.pool;
  if (avoided.applied) {
    whyHints.push(`Skipped ${avoided.excludedCount} piece${avoided.excludedCount === 1 ? "" : "s"} worn in the last ${avoidDays} days`);
  }

  // N32 / W052: prefer user-defined capsule when toggle allows and members remain
  const capsuleIds = readCapsuleItemIds(user?.prefs);
  const wantCapsule = opts.preferCapsule !== false;
  let capsulePool: { pool: typeof pool; restricted: boolean; memberCount: number } = {
    pool,
    restricted: false,
    memberCount: 0,
  };
  if (wantCapsule) {
    capsulePool = preferCapsulePool(pool, capsuleIds, 1);
    if (capsulePool.restricted) {
      pool = capsulePool.pool;
      whyHints.push(`Using your ${capsulePool.memberCount}-item capsule`);
    }
  }

  let { scored } = rankWardrobeItems({
    items: pool,
    styleProfile,
    wearCount,
    weather,
    blockedIds: recentlyWorn,
  });

  if (wantCapsule && capsuleIds.length > 0 && !capsulePool.restricted) {
    const boosted = applyCapsulePreference(scored, capsuleIds);
    scored = boosted.scored;
    if (boosted.whyHint) whyHints.push(boosted.whyHint);
  }

  const { selected, hasMore } = pickOutfitSlice(scored, {
    altIndex,
    pickCount: 3,
    excludeIds: recentlyWorn,
  });
  if (selected.length === 0) return null;

  // N30: attach accessories / jewelry to complete the morning outfit
  const accessories = attachAccessoriesToOutfit(
    selected.map((it) => ({
      id: it.id,
      category: it.category,
      colors: it.colors,
      brand: (it as { brand?: string | null }).brand ?? null,
    })),
    pool.map((it: any) => ({
      id: it.id,
      category: it.category,
      colors: it.colors,
      brand: it.brand ?? null,
    })),
    { limit: 1, excludeIds: recentlyWorn },
  );
  const withAccessories = [...selected];
  for (const acc of accessories) {
    const row = pool.find((it: any) => it.id === acc.id);
    if (row) withAccessories.push(row);
  }
  if (accessories.length > 0) {
    whyHints.push(`Added ${accessories.length} accessor${accessories.length === 1 ? "y" : "ies"} to finish the look`);
  }

  const whyThis = buildWhyThis({
    whyHints,
    selected: withAccessories,
    styleProfile,
    wearCount,
    weather,
    altIndex,
  });
  const itemIds = withAccessories.map((it) => it.id);
  const occasion = opts.occasion ?? weatherOccasion(weather);
  const now = opts.now ?? new Date();
  const plannedFor = opts.plannedFor ?? toDateKey(now, ctx.timeZone);
  const payload = {
    userId,
    itemIds,
    occasion,
    weatherCtx: { ...(weather ?? {}), whyThis, altIndex, hasMore, calendarOccasion: opts.occasion ?? null },
    styleProfileSnapshot: styleProfile,
    plannedFor: altIndex > 0 && !opts.replace ? null : plannedFor,
  };

  // Alt previews are never saved; /outfits/today/select commits one for the day.
  if (opts.persist === false) {
    const preview = { ...payload, id: randomUUID(), plannedFor: null, generatedAt: now, createdAt: now };
    return Object.assign(preview, { _hasMore: hasMore, _altIndex: altIndex });
  }
  const outfit =
    payload.plannedFor && app.deps.repos.upsertOutfitForDate
      ? await app.deps.repos.upsertOutfitForDate(payload as any)
      : await app.deps.repos.createOutfit(payload as any);

  try {
    if (app.deps.repos.recordPushEvent && !opts.skipPush && altIndex === 0) {
      await app.deps.repos.recordPushEvent({
        userId,
        orderId: null,
        eventType: "OUTFIT_READY",
        dedupeKey: `outfit:${outfit.id}`,
        title: "Your outfit for today is ready",
        body: whyThis[0] ?? `We picked ${selected.map((s) => s.category).join(", ")}.`,
        payload: {
          outfitId: outfit.id,
          screen: "today",
          deepLink: "worn://today?focus=outfit",
        } as any,
        status: "QUEUED",
      });
    }
  } catch {
    // ignore push failure — generation succeeded
  }

  if (!opts.skipPush) {
    try {
      await scheduleMorningOutfit(userId, { timeZone: ctx.timeZone });
    } catch {
      // best-effort morning job
    }
  }

  trackServerEvent("outfit_generated", { userId, outfitId: outfit.id, plannedFor, altIndex });
  return Object.assign(outfit, { _hasMore: hasMore, _altIndex: altIndex });
}

export const outfitsRoutes: FastifyPluginAsyncZod = async (app) => {
  /** N52 — complete-the-look: owned slots + affiliate fills for gaps. */
  app.get(
    "/outfits/complete-look",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        querystring: z.object({
          /** Optional base wardrobe item ids (defaults to today's outfit or full closet sample). */
          itemIds: z.string().optional(),
        }),
        response: { 200: CompleteLookResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const rawIds = (request.query as { itemIds?: string }).itemIds;
      const uuid = z.string().uuid();
      const requestedIds = rawIds
        ? [...new Set(rawIds.split(",").map((s) => s.trim()))].filter((s) => uuid.safeParse(s).success).slice(0, 20)
        : [];

      let ownedItems: any[];
      if (requestedIds.length > 0) {
        ownedItems = await app.deps.repos.findWardrobeItemsByIds(userId, requestedIds);
      } else {
        const user = await app.deps.repos.findUserById(userId);
        const todayKey = toDateKey(new Date(), resolveTimeZone(user?.timeZone));
        const today = await app.deps.repos.getTodayOutfit(userId, todayKey);
        const fromOutfit = today?.itemIds?.length
          ? await app.deps.repos.findWardrobeItemsByIds(userId, today.itemIds as string[])
          : [];
        ownedItems = fromOutfit.length > 0 ? fromOutfit : await app.deps.repos.listWardrobeItems(userId);
      }
      const owned = ownedItems.map((it: any) => ({
        id: it.id,
        category: it.category,
        colors: it.colors,
        brand: it.brand,
      }));

      // Scan listings a page at a time (owned colours first) until every gap has a fill or the
      // bound is reached, instead of only ever seeing the newest 100.
      const gaps = detectMissingSlots(owned);
      const listings: any[] = [];
      const styleKeywords = [...new Set(owned.flatMap((o) => o.colors ?? []))].slice(0, 10);
      let cursor: string | undefined;
      while (gaps.length > 0 && listings.length < COMPLETE_LOOK_MAX_LISTINGS) {
        const page = await app.deps.repos.listListings({
          limit: 100,
          cursor,
          styleKeywords: styleKeywords.length > 0 ? styleKeywords : undefined,
        });
        listings.push(...page.items);
        if (buildCompleteLook({ owned, listings }).missing.length >= gaps.length || !page.nextCursor) break;
        cursor = page.nextCursor;
      }
      const look = buildCompleteLook({ owned, listings });
      trackServerEvent("outfit_complete_look", {
        userId,
        owned: look.owned.length,
        missing: look.missing.length,
      });
      return {
        owned: look.owned.map((o) => ({
          slot: o.slot,
          item: {
            id: o.item.id,
            category: o.item.category,
            colors: o.item.colors ?? undefined,
            brand: o.item.brand ?? null,
          },
        })),
        missing: look.missing,
        gaps: look.gaps,
        summary: look.summary,
      };
    },
  );

  app.get(
    "/outfits/today",
    {
      preHandler: [requireAuth, requireEntitlement("outfits")],
      schema: {
        tags: ["outfits"],
        querystring: z.object({
          /** 0 = primary; 1+ = ranked alternatives excluding worn-blocked pieces. */
          alt: z.coerce.number().int().min(0).max(20).optional(),
        }),
        response: {
          200: TodayOutfitResponseSchema.extend({
            altIndex: z.number().int().nonnegative().optional(),
            hasMore: z.boolean().optional(),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const altIndex = (request.query as { alt?: number }).alt ?? 0;
      const now = new Date();
      // A GET: no pushes and no jobs. It only saves today's outfit (one row per user and local day)
      // when the day has none yet, or re-rolls it for a weather shift.
      const ctx = await loadOutfitContext(app, userId, now);

      // Swipe alternatives: ranked slices excluding recently worn, never saved
      if (altIndex > 0) {
        const fresh = await generateOutfitForUser(app, userId, {
          altIndex,
          skipPush: true,
          now,
          plannedFor: null,
          ctx,
          persist: false,
        });
        if (!fresh) {
          trackServerEvent("outfit_alt_viewed", { userId, hasOutfit: false, altIndex });
          return { outfit: null, generated: false, altIndex, hasMore: false, weatherRerolled: false };
        }
        trackServerEvent("outfit_alt_viewed", { userId, outfitId: fresh.id, altIndex });
        return {
          outfit: await hydrateOutfit(app, userId, fresh),
          generated: true,
          altIndex: (fresh as any)._altIndex ?? altIndex,
          hasMore: Boolean((fresh as any)._hasMore),
          weatherRerolled: false,
        };
      }

      const todayKey = toDateKey(now, ctx.timeZone);
      let outfit = await app.deps.repos.getTodayOutfit(userId, todayKey);
      let generated = false;
      let weatherRerolled = false;
      // A plan for the user's today is kept whenever it was made (week plans, pins); anything else
      // (no outfit, or the latest one is for another day) gets today's generated.
      const stale = !outfit || outfit.plannedFor !== todayKey;

      // Weather re-roll before the user's noon when the forecast shifted past threshold (never a pinned day)
      if (outfit && !stale && !shouldSkipPinnedOnReroll(outfit.weatherCtx, { replacePinned: false })) {
        const prev = weatherFromCtx(outfit.weatherCtx);
        if (
          prev &&
          shouldRerollOutfitForWeather({
            prevWeather: prev,
            currentWeather: ctx.weather,
            now,
            timeZone: ctx.timeZone,
          })
        ) {
          const fresh = await generateOutfitForUser(app, userId, {
            plannedFor: todayKey,
            now,
            replace: true,
            skipPush: true,
            ctx,
          });
          if (fresh) {
            outfit = fresh;
            generated = true;
            weatherRerolled = true;
            trackServerEvent("outfit_weather_rerolled", { userId, outfitId: fresh.id });
          }
        }
      }

      if (stale && !weatherRerolled) {
        const fresh = await generateOutfitForUser(app, userId, {
          plannedFor: todayKey,
          now,
          skipPush: true,
          ctx,
        });
        if (fresh) {
          outfit = fresh;
          generated = true;
        }
      }
      if (!outfit) {
        trackServerEvent("outfit_viewed", { userId, hasOutfit: false });
        return { outfit: null, generated: false, weatherRerolled: false, altIndex: 0, hasMore: false };
      }
      const hasMore = Boolean((outfit.weatherCtx as any)?.hasMore ?? (outfit as any)._hasMore);
      trackServerEvent("outfit_viewed", { userId, outfitId: outfit.id, weatherRerolled });
      return {
        outfit: await hydrateOutfit(app, userId, outfit),
        generated,
        weatherRerolled,
        altIndex: 0,
        hasMore,
      };
    },
  );

  app.post(
    "/outfits/today/select",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        body: z.object({
          outfitId: z.string().uuid().optional(),
          alt: z.number().int().min(0).max(20).optional(),
        }),
        response: {
          200: z.object({
            outfit: OutfitSchema.nullable(),
            altIndex: z.number().int(),
          }),
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as { outfitId?: string; alt?: number };
      let altIndex = body.alt ?? 0;
      let source: any = null;
      const outfitCtx = await loadOutfitContext(app, userId);

      if (body.outfitId) {
        source = await app.deps.repos.findOutfitById(body.outfitId, userId);
        // Swipe previews are not saved, so their id is unknown here: the client also sends `alt`,
        // which ranks the same look again.
        if (!source && body.alt === undefined) {
          return reply.code(400).send({ error: "Bad Request", message: "Outfit not found" });
        }
        const ctx = (source?.weatherCtx ?? {}) as { altIndex?: number };
        if (typeof ctx.altIndex === "number") altIndex = ctx.altIndex;
      }
      if (!source) {
        source = await generateOutfitForUser(app, userId, {
          altIndex,
          skipPush: true,
          plannedFor: null,
          ctx: outfitCtx,
          persist: false,
        });
      }
      if (!source) return { outfit: null, altIndex };

      const plannedFor = toDateKey(new Date(), outfitCtx.timeZone);
      const committed = await app.deps.repos.upsertOutfitForDate({
        userId,
        itemIds: source.itemIds,
        occasion: source.occasion,
        weatherCtx: {
          ...(source.weatherCtx as object),
          selectedAlt: altIndex,
          committedAt: new Date().toISOString(),
        },
        styleProfileSnapshot: source.styleProfileSnapshot ?? null,
        plannedFor,
      });
      trackServerEvent("outfit_selected", { userId, outfitId: committed.id, altIndex });
      return { outfit: await hydrateOutfit(app, userId, committed), altIndex };
    },
  );

  app.get(
    "/outfits/week",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        querystring: z.object({
          weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }),
        response: { 200: WeekOutfitsResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const weekStart = (request.query as { weekStart?: string }).weekStart;
      const user = await app.deps.repos.findUserById(userId);
      const days = weekDayKeys({ weekStart, now: new Date(), timeZone: resolveTimeZone(user?.timeZone) });
      const from = days[0]!.date;
      const to = days[6]!.date;
      const planned = await app.deps.repos.listOutfitsInRange(userId, from, to);
      const byDate = new Map(planned.map((o: any) => [o.plannedFor as string, o]));
      const dayOutfits = days.map((d) => byDate.get(d.date) ?? null);
      const hydrated = await hydrateOutfits(app, userId, dayOutfits.filter(Boolean));
      const hydratedById = new Map(hydrated.map((h) => [h.id, h]));
      return {
        weekStart: from,
        days: days.map((d, i) => ({
          date: d.date,
          weekday: d.weekday,
          isToday: d.isToday,
          outfit: dayOutfits[i] ? (hydratedById.get(dayOutfits[i].id) ?? null) : null,
        })),
      };
    },
  );

  app.post(
    "/outfits/week/generate",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        body: GenerateWeekDayBodySchema,
        response: {
          200: z.object({
            days: z.array(
              z.object({
                date: z.string(),
                outfit: OutfitSchema.nullable(),
              }),
            ),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const body = request.body as { date?: string; fillWeek?: boolean; preferCapsule?: boolean; replacePinned?: boolean };
      const now = new Date();
      const ctx = await loadOutfitContext(app, userId, now);
      const daysMeta = weekDayKeys({ now, timeZone: ctx.timeZone });
      const targets = body.fillWeek
        ? daysMeta.map((d) => d.date)
        : [body.date ?? toDateKey(now, ctx.timeZone)];

      const results: Array<{ date: string; outfit: any; skippedPinned?: boolean; pinConflict?: string }> = [];
      for (const date of targets) {
        const existing = await app.deps.repos.getOutfitForDate?.(userId, date);
        if (existing && shouldSkipPinnedOnReroll(existing.weatherCtx, { replacePinned: body.replacePinned })) {
          const warn = pinConflictWarn(date, existing.weatherCtx, Boolean(body.replacePinned));
          results.push({
            date,
            outfit: existing,
            skippedPinned: true,
            pinConflict: warn?.message,
          });
          continue;
        }
        if (existing && !body.date && body.fillWeek) {
          results.push({ date, outfit: existing });
          continue;
        }
        const outfit = await generateOutfitForUser(app, userId, {
          plannedFor: date,
          replace: true,
          preferCapsule: body.preferCapsule,
          ctx,
          now,
        });
        results.push({ date, outfit: outfit ?? null });
      }
      const hydrated = await hydrateOutfits(app, userId, results.flatMap((r) => (r.outfit ? [r.outfit] : [])));
      const hydratedById = new Map(hydrated.map((h) => [h.id, h]));
      return {
        days: results.map((r) => ({ ...r, outfit: r.outfit ? (hydratedById.get(r.outfit.id) ?? null) : null })),
      };
    },
  );

  app.patch(
    "/outfits/week/:date",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        params: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
        body: PatchWeekDayBodySchema,
        response: { 200: OutfitSchema, 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { date } = request.params as { date: string };
      const body = request.body as { itemIds?: string[]; occasion?: any; pinned?: boolean };
      if (body.itemIds && !(await ownsAllItems(app, userId, body.itemIds))) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      let outfit = await app.deps.repos.getOutfitForDate?.(userId, date);
      if (!outfit) {
        if (!body.itemIds?.length && body.pinned === undefined) {
          return reply.code(404).send({ error: "Not Found", message: "No outfit for that day" });
        }
        if (body.itemIds?.length) {
          outfit = await app.deps.repos.upsertOutfitForDate({
            userId,
            plannedFor: date,
            itemIds: body.itemIds,
            occasion: body.occasion ?? null,
            weatherCtx: body.pinned != null ? withOutfitPinned(null, body.pinned) : null,
          });
        } else {
          return reply.code(404).send({ error: "Not Found", message: "No outfit for that day" });
        }
      } else {
        const weatherCtx =
          body.pinned !== undefined
            ? withOutfitPinned(outfit.weatherCtx, body.pinned)
            : outfit.weatherCtx;
        const updated = await app.deps.repos.updateOutfit(outfit.id, userId, {
          itemIds: body.itemIds,
          occasion: body.occasion,
          weatherCtx,
        });
        if (!updated) {
          return reply.code(404).send({ error: "Not Found", message: "Outfit not found" });
        }
        outfit = updated;
        if (body.pinned === true) {
          audit(app.log, "outfit.day.pinned", { userId, date, outfitId: outfit.id });
          trackServerEvent("outfit_day_pinned", { userId, date });
        } else if (body.pinned === false) {
          audit(app.log, "outfit.day.unpinned", { userId, date, outfitId: outfit.id });
          trackServerEvent("outfit_day_unpinned", { userId, date });
        }
      }
      const hydrated = await hydrateOutfit(app, userId, outfit);
      return {
        ...hydrated,
        weatherCtx: {
          ...(hydrated.weatherCtx ?? {}),
          pinned: isOutfitPinned(outfit.weatherCtx),
        },
      };
    },
  );

  app.post(
    "/outfits/generate",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        response: { 200: z.object({ outfit: OutfitSchema.nullable() }), 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const ctx = await loadOutfitContext(app, userId);
      const outfit = await generateOutfitForUser(app, userId, {
        plannedFor: toDateKey(new Date(), ctx.timeZone),
        replace: true,
        ctx,
      });
      if (!outfit) return { outfit: null };
      return { outfit: await hydrateOutfit(app, userId, outfit) };
    },
  );

  /** N24 — trip dates → packing capsule + checklist from owned wardrobe. */
  app.post(
    "/outfits/travel-pack",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        body: TravelPackBodySchema,
        response: { 200: TravelPackResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as {
        startDate: string;
        endDate: string;
        maxItems?: number;
        lat?: number;
        lon?: number;
      };
      if (body.endDate < body.startDate) {
        return reply.code(400).send({ error: "Bad Request", message: "endDate must be on or after startDate" });
      }
      const weather = await resolveWeather({
        lat: body.lat ?? 12.97,
        lon: body.lon ?? 77.59,
        date: new Date(`${body.startDate}T12:00:00.000Z`),
      });
      const wardrobe = await app.deps.repos.listWardrobeItems(userId);
      const pack = buildTravelPack(wardrobe, {
        startDate: body.startDate,
        endDate: body.endDate,
        weather,
        maxItems: body.maxItems,
      });
      trackServerEvent("travel_pack_built", {
        userId,
        nights: pack.nights,
        itemCount: pack.items.length,
      });
      return {
        startDate: pack.startDate,
        endDate: pack.endDate,
        nights: pack.nights,
        constraints: {
          nights: pack.constraints.nights,
          maxItems: pack.constraints.maxItems,
          perSlot: pack.constraints.perSlot as Record<string, number>,
        },
        items: pack.items,
        checklist: pack.checklist,
        weather: pack.weather
          ? {
              tempC: pack.weather.tempC,
              condition: pack.weather.condition,
              source: pack.weather.source,
              fetchedAt: pack.weather.fetchedAt,
            }
          : null,
      };
    },
  );

  /** N28 — weekday workwear rotation into week calendar. */
  app.post(
    "/outfits/week/workwear",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        body: WorkwearRotationBodySchema,
        response: { 200: WorkwearRotationResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const body = request.body as { weekStart?: string; commit?: boolean };
      const user = await app.deps.repos.findUserById(userId);
      const daysMeta = weekDayKeys({ weekStart: body.weekStart, now: new Date(), timeZone: resolveTimeZone(user?.timeZone) });
      const wardrobe = await app.deps.repos.listWardrobeItems(userId);
      const plans = planWorkwearRotation(wardrobe, daysMeta);
      const unique = rotationIsUnique(plans);
      const commit = body.commit !== false;

      const saved: any[] = [];
      if (commit) {
        for (const plan of plans) {
          saved.push(
            await app.deps.repos.upsertOutfitForDate({
              userId,
              plannedFor: plan.date,
              itemIds: plan.itemIds,
              occasion: "WORK",
              weatherCtx: { source: "workwear_rotation", unique },
            }),
          );
        }
      }
      const hydrated = await hydrateOutfits(app, userId, saved);
      const days = plans.map((plan, i) => ({
        date: plan.date,
        weekday: plan.weekday,
        itemIds: plan.itemIds,
        occasion: "WORK" as const,
        outfit: commit ? (hydrated[i] ?? null) : null,
      }));

      trackServerEvent("workwear_rotation_planned", {
        userId,
        days: days.length,
        unique,
        commit,
      });
      return {
        weekStart: daysMeta[0]!.date,
        unique,
        days,
      };
    },
  );

  /** N03 — device calendar events → occasion outfits (+ optional night-before reminder). */
  app.post(
    "/outfits/from-calendar",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        body: FromCalendarBodySchema,
        response: { 200: FromCalendarResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const body = request.body as {
        events: Array<{ id?: string; title?: string; startAt: string; endAt?: string }>;
        remindNightBefore?: boolean;
        commit?: boolean;
      };
      const remindNightBefore = body.remindNightBefore === true;
      const commit = body.commit !== false;
      const now = new Date();
      // One read of the closet and history for all (up to 20) events.
      const ctx = commit ? await loadOutfitContext(app, userId, now) : undefined;

      const results = [];
      for (const ev of body.events) {
        const plan = planOutfitFromCalendarEvent(ev, { now, remindNightBefore });
        let outfit: any = null;
        if (commit) {
          outfit = await generateOutfitForUser(app, userId, {
            plannedFor: plan.plannedFor,
            replace: true,
            occasion: plan.occasion,
            whyHints: [plan.reason, `Calendar: ${plan.title}`],
            skipPush: true,
            now,
            ctx,
          });
          if (outfit) outfit = await hydrateOutfit(app, userId, outfit);
        }

        let reminderScheduled = false;
        if (remindNightBefore && plan.remindAt) {
          const status = await scheduleCalEventOutfitReminder({
            userId,
            eventId: plan.eventId,
            title: plan.title,
            occasion: plan.occasion,
            plannedFor: plan.plannedFor,
            startAt: plan.startAt,
            remindAt: plan.remindAt,
          });
          reminderScheduled = status === "published";
          if (app.deps.repos.recordPushEvent) {
            try {
              await app.deps.repos.recordPushEvent({
                userId,
                orderId: null,
                eventType: "OUTFIT_READY",
                dedupeKey: `cal-outfit:${userId}:${plan.eventId ?? plan.plannedFor}:${plan.title}`,
                title: `Outfit ready for ${plan.title}`,
                body: `${plan.occasion} look for tomorrow — ${plan.reason}`,
                payload: {
                  screen: "today",
                  deepLink: "worn://today?focus=outfit",
                  occasion: plan.occasion,
                  plannedFor: plan.plannedFor,
                  remindAt: plan.remindAt,
                } as any,
                status: "QUEUED",
              });
            } catch {
              // best-effort queue row
            }
          }
        }

        trackServerEvent("cal_event_outfit", {
          userId,
          occasion: plan.occasion,
          plannedFor: plan.plannedFor,
          reminded: reminderScheduled,
        });

        results.push({
          eventId: plan.eventId,
          title: plan.title,
          startAt: plan.startAt,
          occasion: plan.occasion,
          reason: plan.reason,
          plannedFor: plan.plannedFor,
          remindAt: plan.remindAt,
          reminderScheduled,
          outfit,
        });
      }

      return { events: results };
    },
  );

  /** N39 — wedding / festival multi-day outfits + spend envelope. */
  app.post(
    "/outfits/wedding-festival",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        body: WeddingFestivalBodySchema,
        response: { 200: WeddingFestivalResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as {
        startDate: string;
        endDate: string;
        kind: "wedding" | "festival";
        label?: string;
        budgetLimitMinor?: number;
        plannedSpendMinor?: number;
        commit?: boolean;
      };
      if (body.endDate < body.startDate) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "endDate must be on or after startDate",
        });
      }
      const wardrobe = await app.deps.repos.listWardrobeItems(userId);
      const plan = planWeddingFestival(wardrobe, {
        startDate: body.startDate,
        endDate: body.endDate,
        kind: body.kind,
        label: body.label,
        budgetLimitMinor: body.budgetLimitMinor,
        plannedSpendMinor: body.plannedSpendMinor,
      });
      const commit = body.commit !== false;

      // At most WEDDING_FESTIVAL_MAX_DAYS days (body schema and eventDayKeys): one upsert per day,
      // then one item read for all of them.
      const savedByDate = new Map<string, any>();
      if (commit) {
        for (const day of plan.days) {
          if (!day.itemIds.length) continue;
          savedByDate.set(
            day.date,
            await app.deps.repos.upsertOutfitForDate({
              userId,
              plannedFor: day.date,
              itemIds: day.itemIds,
              occasion: day.occasion,
              weatherCtx: {
                source: "wedding_festival",
                kind: plan.kind,
                dayLabel: day.dayLabel,
                label: plan.label,
              },
            }),
          );
        }
      }
      const hydrated = await hydrateOutfits(app, userId, [...savedByDate.values()]);
      const hydratedById = new Map(hydrated.map((h) => [h.id, h]));
      const days = plan.days.map((day) => {
        const saved = savedByDate.get(day.date);
        return {
          date: day.date,
          weekday: day.weekday,
          dayIndex: day.dayIndex,
          dayLabel: day.dayLabel,
          occasion: day.occasion,
          itemIds: day.itemIds,
          outfit: saved ? (hydratedById.get(saved.id) ?? null) : null,
        };
      });

      trackServerEvent("wedding_festival_planned", {
        userId,
        kind: plan.kind,
        dayCount: plan.dayCount,
        days: days.length,
        envelopeStatus: plan.envelope?.status ?? null,
      });

      return {
        kind: plan.kind,
        label: plan.label,
        startDate: plan.startDate,
        endDate: plan.endDate,
        dayCount: plan.dayCount,
        days,
        envelope: plan.envelope,
      };
    },
  );

  const interviewKitStore = createInterviewKitStore(app.deps.repos);
  /** A queue outage leaves the kit saved with reminderScheduled false instead of failing the save. */
  const scheduleKitReminder = async (
    log: { warn: (obj: object, msg: string) => void },
    kit: Awaited<ReturnType<typeof interviewKitStore.save>>,
    remindAt: string,
  ) => {
    try {
      return await scheduleInterviewKitReminder({
        userId: kit.userId,
        kitId: kit.id,
        name: kit.name,
        kind: kit.kind,
        eventAt: kit.eventAt,
        remindAt,
        occasion: kit.occasion,
      });
    } catch (err) {
      if (!(err instanceof QueueUnavailableError)) throw err;
      log.warn({ err, kitId: kit.id }, "interview_kit.reminder_unavailable");
      return "unavailable" as const;
    }
  };

  /** N40 — list saved interview / ceremony kits. */
  app.get(
    "/outfits/interview-kit",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        response: { 200: InterviewKitListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const kits = (await interviewKitStore.listByUser(userId)).map((k) => ({
        ...k,
        outfit: null,
      }));
      return { kits };
    },
  );

  /** N40 — save interview / ceremony kit + optional night-before (−1d) reminder. */
  app.post(
    "/outfits/interview-kit",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        body: InterviewKitBodySchema,
        response: { 200: InterviewKitResponseSchema, 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as {
        name: string;
        kind?: "interview" | "ceremony";
        itemIds: string[];
        eventAt: string;
        occasion?: OutfitOccasion;
        remindNightBefore?: boolean;
        commit?: boolean;
      };
      if (!(await ownsAllItems(app, userId, body.itemIds))) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const now = new Date();
      let kit;
      try {
        kit = await interviewKitStore.save({
          userId,
          name: body.name,
          kind: body.kind ?? "interview",
          itemIds: body.itemIds,
          eventAt: body.eventAt,
          occasion: body.occasion,
          now,
        });
      } catch (err) {
        return reply.code(400).send({
          error: "Bad Request",
          message: err instanceof Error ? err.message : "Invalid kit",
        });
      }

      const commit = body.commit !== false;
      const plannedFor = plannedForFromEvent(kit.eventAt);
      let outfit: any = null;
      if (commit) {
        outfit = await app.deps.repos.upsertOutfitForDate({
          userId,
          plannedFor,
          itemIds: kit.itemIds,
          occasion: kit.occasion,
          weatherCtx: {
            source: "interview_kit",
            kitId: kit.id,
            kind: kit.kind,
            name: kit.name,
          },
        });
        outfit = await hydrateOutfit(app, userId, outfit);
      }

      let reminderScheduled = false;
      const wantRemind = body.remindNightBefore !== false;
      if (wantRemind && kit.remindAt) {
        const status = await scheduleKitReminder(request.log, kit, kit.remindAt);
        // "skipped" only happens outside production without REDIS_URL; the intent is kept.
        if (status === "published" || status === "skipped") {
          kit = (await interviewKitStore.markReminderScheduled(kit.id, userId, kit.remindAt)) ?? kit;
        }
        reminderScheduled = kit.reminderScheduled;
        if (app.deps.repos.recordPushEvent) {
          try {
            await app.deps.repos.recordPushEvent({
              userId,
              orderId: null,
              eventType: "OUTFIT_READY",
              dedupeKey: `interview-kit:${userId}:${kit.id}`,
              title: `${kit.name} — ready tomorrow`,
              body: `Night-before reminder for your ${kit.kind} look`,
              payload: {
                screen: "today",
                deepLink: "worn://today?focus=outfit",
                kitId: kit.id,
                kind: kit.kind,
                remindAt: kit.remindAt,
                plannedFor,
              } as any,
              status: "QUEUED",
            });
          } catch {
            // best-effort queue row
          }
        }
      }

      trackServerEvent("interview_kit_saved", {
        userId,
        kind: kit.kind,
        reminded: reminderScheduled,
        itemCount: kit.itemIds.length,
      });

      return {
        kit: {
          ...kit,
          reminderScheduled,
          outfit,
        },
      };
    },
  );

  /** W056 — edit eventAt or cancel night-before reminder. */
  app.patch(
    "/outfits/interview-kit/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["outfits"],
        params: z.object({ id: z.string().uuid() }),
        body: InterviewKitPatchBodySchema,
        response: {
          200: InterviewKitResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as {
        eventAt?: string;
        cancelReminder?: boolean;
        remindNightBefore?: boolean;
      };
      let kit = await interviewKitStore.get(id, userId);
      if (!kit) {
        return reply.code(404).send({ error: "Not Found", message: "Kit not found" });
      }

      try {
        if (body.eventAt) {
          kit = (await interviewKitStore.updateEvent(id, userId, body.eventAt)) ?? kit;
        }
        if (body.cancelReminder) {
          kit = (await interviewKitStore.cancelReminder(id, userId)) ?? kit;
        } else if (body.remindNightBefore && kit.remindAt) {
          const status = await scheduleKitReminder(request.log, kit, kit.remindAt);
          if (status === "published" || status === "skipped") {
            kit = (await interviewKitStore.markReminderScheduled(kit.id, userId, kit.remindAt)) ?? kit;
          }
        }
      } catch (err) {
        return reply.code(400).send({
          error: "Bad Request",
          message: err instanceof Error ? err.message : "Invalid patch",
        });
      }

      trackServerEvent("interview_kit_patched" as never, {
        userId,
        kitId: kit.id,
        cancelReminder: Boolean(body.cancelReminder),
        edited: Boolean(body.eventAt),
      });

      return { kit };
    },
  );
};

export { generateOutfitForUser };
