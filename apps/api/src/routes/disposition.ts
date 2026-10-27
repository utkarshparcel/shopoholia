import {
  BookDispositionPickupBodySchema,
  CreateDispositionBodySchema,
  DeclutterChallengeStartBodySchema,
  DeclutterChallengeStartResponseSchema,
  DispositionCreateResponseSchema,
  DispositionListResponseSchema,
  DispositionPickupBookingSchema,
  DispositionPriceSuggestSchema,
  LogisticsPartnersResponseSchema,
  buildDeclutterShareCard,
  countDisposedItems,
  declutterChallengeProgress,
  resolveDisposeTree,
  keepSnoozeUntil,
  type BookDispositionPickupBody,
  type CreateDispositionBody,
  type DeclutterChallengeStartBody,
  type DispositionPickupBooking,
  type DisposeTreeAnswers,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { audit } from "../lib/audit.js";
import { prepareDispositionRails } from "../lib/disposition-marketplace.js";
import {
  LOGISTICS_PARTNERS,
  bookDispositionPickup,
  partnersForMode,
  suggestDispositionPrice,
} from "../lib/disposition-logistics.js";
import { getKeepSnooze, setKeepSnooze } from "../lib/closet-ops-prefs.js";
import type { DispositionListingRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

/** In-process declutter challenge starts (userId → target). */
const startedDeclutterChallenges = new Map<string, { target: number }>();

/** DISP-LOGISTICS — in-memory pickup bookings (stub; keyed by disposition id). */
const dispositionPickupBookings = new Map<string, DispositionPickupBooking>();

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

export function declutterPayloadForUser(
  userId: string,
  listings: DispositionListingRecord[],
) {
  const started = startedDeclutterChallenges.get(userId);
  const progressCount = countDisposedItems(listings);
  const challenge = declutterChallengeProgress(progressCount, {
    started: Boolean(started),
    target: started?.target,
  });
  const shareCard = buildDeclutterShareCard({
    progress: challenge.progress,
    target: challenge.target,
    modes: listings
      .filter((l) => l.status !== "CANCELLED")
      .map((l) => l.mode),
  });
  return { declutterChallenge: challenge, declutterShareCard: shareCard };
}

/** Test helper — reset in-memory challenge state between suites if needed. */
export function __resetDeclutterChallengeStateForTests() {
  startedDeclutterChallenges.clear();
}

/** Test helper — reset logistics pickup stubs. */
export function __resetDispositionPickupBookingsForTests() {
  dispositionPickupBookings.clear();
}

export const dispositionRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /disposition
  app.get(
    "/disposition",
    {
      preHandler: requireAuth,
      schema: { tags: ["disposition"], response: { 200: DispositionListResponseSchema, 401: ErrorSchema } },
    },
    async (request) => {
      const userId = request.user!.sub;
      const listings = await app.deps.repos.listDispositionListings(userId);
      const declutter = declutterPayloadForUser(userId, listings);
      return { listings: listings.map(toDispositionJson), ...declutter };
    },
  );

  // GET /disposition/partners — logistics partner stub list (DISP-LOGISTICS)
  app.get(
    "/disposition/partners",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disposition"],
        querystring: z.object({
          mode: z.enum(["SELL", "DONATE", "BARTER"]).optional(),
        }),
        response: { 200: LogisticsPartnersResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const mode = request.query.mode;
      const partners = mode ? partnersForMode(mode) : [...LOGISTICS_PARTNERS];
      return { partners };
    },
  );

  // GET /disposition/suggest-price — heuristic ask price (DISP-LOGISTICS)
  app.get(
    "/disposition/suggest-price",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disposition"],
        querystring: z.object({ wardrobeItemId: z.string().uuid() }),
        response: {
          200: DispositionPriceSuggestSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { wardrobeItemId } = request.query;
      const item = await app.deps.repos.findWardrobeItem(wardrobeItemId, userId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const metric = await app.deps.repos.findItemMetric(userId, wardrobeItemId);
      const suggestion = suggestDispositionPrice({
        costMinor: item.costMinor,
        createdAt: item.createdAt,
        category: item.category,
        brand: item.brand,
        wearCount: metric?.wearCount ?? 0,
      });
      trackServerEvent("disposition_price_suggested", {
        userId,
        wardrobeItemId,
        suggestedPriceMinor: suggestion.suggestedPriceMinor,
      });
      return {
        wardrobeItemId,
        ...suggestion,
      };
    },
  );

  /** Start a declutter challenge: sell/donate N unique wardrobe items. */
  app.post(
    "/disposition/challenge",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disposition"],
        body: DeclutterChallengeStartBodySchema.default({}),
        response: {
          200: DeclutterChallengeStartResponseSchema,
          401: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = (request.body ?? {}) as DeclutterChallengeStartBody;
      const listings = await app.deps.repos.listDispositionListings(userId);
      const existing = startedDeclutterChallenges.get(userId);
      const target = body.target ?? existing?.target;
      const challenge = declutterChallengeProgress(countDisposedItems(listings), {
        started: true,
        target,
      });

      if (challenge.completed) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Declutter challenge already completed",
        });
      }

      startedDeclutterChallenges.set(userId, { target: challenge.target });

      await app.deps.push.send({
        userId,
        eventType: "DECLUTTER_CHALLENGE",
        title: "Declutter challenge",
        body:
          challenge.progress === 0
            ? `Clear ${challenge.target} pieces — sell or donate from dead inventory.`
            : `${challenge.label} — keep going.`,
        link: {
          deepLink: "worn://disposition",
          screen: "disposition",
        },
      });

      trackServerEvent("declutter_challenge_started", {
        userId,
        progress: challenge.progress,
        target: challenge.target,
      });

      const shareCard = buildDeclutterShareCard({
        progress: challenge.progress,
        target: challenge.target,
        modes: listings.filter((l) => l.status !== "CANCELLED").map((l) => l.mode),
      });

      return {
        declutterChallenge: { ...challenge, started: true },
        declutterShareCard: shareCard,
        pushQueued: true,
      };
    },
  );

  // POST /disposition
  app.post(
    "/disposition",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disposition"],
        body: CreateDispositionBodySchema,
        response: { 201: DispositionCreateResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateDispositionBody;
      const item = await app.deps.repos.findWardrobeItem(body.wardrobeItemId, userId);
      if (!item) return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      const mode = body.mode ?? "SELL";
      const priceMinor = body.priceMinor ?? null;
      const { sellerId } = await prepareDispositionRails(
        app.deps.repos,
        userId,
        item,
        mode,
        priceMinor,
        { createSeller: body.createSeller },
      );
      const listing = await app.deps.repos.createDispositionListing({
        userId,
        wardrobeItemId: body.wardrobeItemId,
        mode,
        priceMinor,
        sellerId,
      });
      trackServerEvent("disposition_created", { userId, wardrobeItemId: body.wardrobeItemId, mode });

      const all = await app.deps.repos.listDispositionListings(userId);
      const started = startedDeclutterChallenges.get(userId);
      if (started) {
        const challenge = declutterChallengeProgress(countDisposedItems(all), {
          started: true,
          target: started.target,
        });
        if (challenge.completed) {
          trackServerEvent("declutter_challenge_completed", {
            userId,
            target: challenge.target,
          });
        }
      }

      return reply.code(201).send(toDispositionJson(listing));
    },
  );

  // GET /disposition/:id
  app.get(
    "/disposition/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disposition"],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: DispositionCreateResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const listing = await app.deps.repos.findDispositionListing(id, userId);
      if (!listing) return reply.code(404).send({ error: "Not Found", message: "Disposition listing not found" });
      return toDispositionJson(listing);
    },
  );

  // POST /disposition/:id/pickup — book logistics partner pickup stub (DISP-LOGISTICS)
  app.post(
    "/disposition/:id/pickup",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disposition"],
        params: z.object({ id: z.string().uuid() }),
        body: BookDispositionPickupBodySchema,
        response: {
          200: DispositionPickupBookingSchema,
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
      const body = request.body as BookDispositionPickupBody;
      const listing = await app.deps.repos.findDispositionListing(id, userId);
      if (!listing) {
        return reply.code(404).send({ error: "Not Found", message: "Disposition listing not found" });
      }
      if (listing.status === "CANCELLED") {
        return reply.code(409).send({ error: "Conflict", message: "Listing is cancelled" });
      }
      const slot = new Date(body.pickupSlotAt);
      const booked = bookDispositionPickup({
        partnerId: body.partnerId,
        pickupSlotAt: slot,
        mode: listing.mode,
      });
      if (!booked.ok) {
        return reply.code(400).send({ error: "Bad Request", message: booked.error });
      }
      const payload: DispositionPickupBooking = {
        dispositionId: id,
        partnerId: booked.booking.partnerId,
        partnerName: booked.booking.partnerName,
        pickupSlotAt: booked.booking.pickupSlotAt.toISOString(),
        bookedAt: booked.booking.bookedAt.toISOString(),
        stub: true,
        etaHours: booked.booking.etaHours,
      };
      dispositionPickupBookings.set(id, payload);
      trackServerEvent("disposition_pickup_booked", {
        userId,
        dispositionId: id,
        partnerId: payload.partnerId,
      });
      return payload;
    },
  );

  // GET /disposition/:id/pickup — read stub booking if any
  app.get(
    "/disposition/:id/pickup",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disposition"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: DispositionPickupBookingSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const listing = await app.deps.repos.findDispositionListing(id, userId);
      if (!listing) {
        return reply.code(404).send({ error: "Not Found", message: "Disposition listing not found" });
      }
      const booking = dispositionPickupBookings.get(id);
      if (!booking) {
        return reply.code(404).send({ error: "Not Found", message: "No pickup booked" });
      }
      return booking;
    },
  );

  /** U035 — dispose decision tree → disposition job or keep snooze. */
  app.post(
    "/disposition/decide",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["disposition"],
        body: z.object({
          wardrobeItemId: z.string().uuid(),
          stillWear: z.boolean().optional(),
          hasValue: z.boolean().optional(),
          willingEffort: z.boolean().optional(),
          preferBarter: z.boolean().optional(),
          priceMinor: z.number().int().nonnegative().nullable().optional(),
        }),
        response: {
          200: z.object({
            mode: z.enum(["SELL", "DONATE", "BARTER", "KEEP"]),
            nextAction: z.enum(["create_disposition", "keep_snooze"]),
            reason: z.string(),
            surface: z.literal("closet"),
            listingId: z.string().uuid().nullable(),
            snoozeUntil: z.string().datetime().nullable(),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as DisposeTreeAnswers & {
        wardrobeItemId: string;
        priceMinor?: number | null;
      };
      const item = await app.deps.repos.findWardrobeItem(body.wardrobeItemId, userId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const result = resolveDisposeTree(body);
      audit(app.log, "dispose.tree.resolved", {
        userId,
        wardrobeItemId: body.wardrobeItemId,
        mode: result.mode,
        nextAction: result.nextAction,
      });
      trackServerEvent("dispose_tree_resolved", {
        userId,
        wardrobeItemId: body.wardrobeItemId,
        mode: result.mode,
      });

      if (result.nextAction === "keep_snooze") {
        const until = keepSnoozeUntil();
        setKeepSnooze(userId, body.wardrobeItemId, until);
        audit(app.log, "waste.keep_snoozed", {
          userId,
          wardrobeItemId: body.wardrobeItemId,
          until,
        });
        trackServerEvent("dispose_keep_snoozed", {
          userId,
          wardrobeItemId: body.wardrobeItemId,
        });
        return {
          ...result,
          listingId: null,
          snoozeUntil: until,
        };
      }

      const mode = result.mode as "SELL" | "DONATE" | "BARTER";
      const priceMinor = body.priceMinor ?? null;
      const { sellerId } = await prepareDispositionRails(
        app.deps.repos,
        userId,
        item,
        mode,
        priceMinor,
        { createSeller: true },
      );
      const listing = await app.deps.repos.createDispositionListing({
        userId,
        wardrobeItemId: body.wardrobeItemId,
        mode,
        priceMinor,
        sellerId,
      });
      trackServerEvent("disposition_created", {
        userId,
        wardrobeItemId: body.wardrobeItemId,
        mode,
      });
      return {
        ...result,
        listingId: listing.id,
        snoozeUntil: getKeepSnooze(userId, body.wardrobeItemId),
      };
    },
  );
};
