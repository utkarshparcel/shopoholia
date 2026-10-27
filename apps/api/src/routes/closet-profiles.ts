import {
  ClosetProfileListResponseSchema,
  ClosetProfileOutfitsResponseSchema,
  ClosetProfileSchema,
  ClosetProfileWardrobeResponseSchema,
  CreateClosetProfileBodySchema,
  PageQuerySchema,
  UpdateClosetProfileBodySchema,
  careRulesOrNull,
  defaultSelfProfileName,
  denyUnlessOwnsProfile,
  mapLimit,
  type CreateClosetProfileBody,
  type PageQuery,
  type UpdateClosetProfileBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { decodeCursor, InvalidCursorError } from "../lib/paging.js";
import type { ClosetProfileRecord, OutfitRecord, WardrobeItemRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const PROFILE_NOT_FOUND = { error: "Not Found", message: "Profile not found" };
/** Kid closets need a guardian-consent flow that doesn't exist yet, so they can't be created. */
const KID_PROFILE_BLOCKED = { error: "Bad Request", message: "Kid profiles aren't available yet" };

function toProfileJson(p: ClosetProfileRecord) {
  return {
    id: p.id,
    ownerUserId: p.ownerUserId,
    householdId: p.householdId,
    name: p.name,
    kind: p.kind,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function toWardrobeJson(
  r: WardrobeItemRecord,
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

function toOutfitJson(o: OutfitRecord) {
  return {
    id: o.id,
    userId: o.userId,
    itemIds: o.itemIds,
    occasion: o.occasion,
    weatherCtx: o.weatherCtx,
    plannedFor: o.plannedFor,
    generatedAt: o.generatedAt.toISOString(),
    createdAt: o.createdAt.toISOString(),
  };
}

export const closetProfileRoutes: FastifyPluginAsyncZod = async (app) => {
  /** List profiles; ensures a SELF "Me" profile exists. */
  app.get(
    "/closet-profiles",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["closet-profiles"],
        response: { 200: ClosetProfileListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      let profiles = await app.deps.repos.listClosetProfiles(userId);
      if (!profiles.some((p) => p.kind === "SELF")) {
        await app.deps.repos.ensureSelfClosetProfile(userId, defaultSelfProfileName());
        profiles = await app.deps.repos.listClosetProfiles(userId);
      }
      const self = profiles.find((p) => p.kind === "SELF");
      return {
        profiles: profiles.map(toProfileJson),
        activeProfileId: self?.id ?? profiles[0]?.id ?? null,
      };
    },
  );

  app.post(
    "/closet-profiles",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["closet-profiles"],
        body: CreateClosetProfileBodySchema,
        response: { 201: ClosetProfileSchema, 400: ErrorSchema, 401: ErrorSchema, 409: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateClosetProfileBody;
      const kind = body.kind ?? "SELF";
      if (kind === "KID") return reply.code(400).send(KID_PROFILE_BLOCKED);
      if (kind === "SELF") {
        const existing = await app.deps.repos.listClosetProfiles(userId);
        if (existing.some((p) => p.kind === "SELF")) {
          return reply
            .code(409)
            .send({ error: "Conflict", message: "You already have your own profile" });
        }
      }
      if (body.householdId) {
        const member = await app.deps.repos.findHouseholdMember(body.householdId, userId);
        if (!member) {
          return reply
            .code(400)
            .send({ error: "Bad Request", message: "Not a member of that household" });
        }
      }
      let profile: ClosetProfileRecord;
      if (kind === "SELF") {
        // Same lock as the GET's lazy SELF, so a racing pair still ends with one SELF row.
        profile = await app.deps.repos.ensureSelfClosetProfile(userId, body.name.trim());
        if (body.householdId) {
          profile =
            (await app.deps.repos.updateClosetProfile(profile.id, userId, {
              householdId: body.householdId,
            })) ?? profile;
        }
      } else {
        profile = await app.deps.repos.createClosetProfile({
          ownerUserId: userId,
          name: body.name.trim(),
          kind,
          householdId: body.householdId ?? null,
        });
      }
      trackServerEvent("closet_profile_created", {
        userId,
        profileId: profile.id,
        kind: profile.kind,
      });
      return reply.code(201).send(toProfileJson(profile));
    },
  );

  app.patch(
    "/closet-profiles/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["closet-profiles"],
        params: z.object({ id: z.string().uuid() }),
        body: UpdateClosetProfileBodySchema,
        response: {
          200: ClosetProfileSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as UpdateClosetProfileBody;
      const existing = await app.deps.repos.findClosetProfile(id);
      // Someone else's profile is reported exactly like a missing one.
      if (denyUnlessOwnsProfile(existing, userId)) return reply.code(404).send(PROFILE_NOT_FOUND);
      if (body.kind === "KID" && existing!.kind !== "KID") {
        return reply.code(400).send(KID_PROFILE_BLOCKED);
      }
      if (body.kind && body.kind !== existing!.kind && (body.kind === "SELF" || existing!.kind === "SELF")) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Your own profile's kind can't change" });
      }
      const updated = await app.deps.repos.updateClosetProfile(id, userId, {
        name: body.name?.trim(),
        kind: body.kind,
      });
      if (!updated) return reply.code(404).send(PROFILE_NOT_FOUND);
      return toProfileJson(updated);
    },
  );

  app.delete(
    "/closet-profiles/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["closet-profiles"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          204: z.null(),
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findClosetProfile(id);
      if (denyUnlessOwnsProfile(existing, userId)) return reply.code(404).send(PROFILE_NOT_FOUND);
      if (existing!.kind === "SELF") {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Cannot delete SELF profile" });
      }
      if (!(await app.deps.repos.deleteClosetProfile(id, userId))) {
        return reply.code(404).send(PROFILE_NOT_FOUND);
      }
      return reply.code(204).send(null);
    },
  );

  /** Switch profile → scoped wardrobe. */
  app.get(
    "/closet-profiles/:id/wardrobe",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["closet-profiles"],
        params: z.object({ id: z.string().uuid() }),
        querystring: PageQuerySchema,
        response: {
          200: ClosetProfileWardrobeResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const q = request.query as PageQuery;
      let after;
      try {
        after = decodeCursor(q.cursor);
      } catch (err) {
        if (err instanceof InvalidCursorError) return reply.code(400).send(err.body);
        throw err;
      }
      const profile = await app.deps.repos.findClosetProfile(id);
      if (denyUnlessOwnsProfile(profile, userId)) return reply.code(404).send(PROFILE_NOT_FOUND);
      const page = await app.deps.repos.listWardrobeItemsPage(userId, { limit: q.limit, after, profileId: id });
      const items = await mapLimit(page.items, 8, async (r) => {
        const imageUrls = await mapLimit(r.imageKeys ?? [], 4, (k) => app.deps.storage.getSignedUrl(k));
        const garmentImageUrl = r.garmentImageKey
          ? await app.deps.storage.getSignedUrl(r.garmentImageKey)
          : null;
        return toWardrobeJson(r, imageUrls, garmentImageUrl);
      });
      trackServerEvent("closet_profile_wardrobe_viewed", { userId, profileId: id });
      return { profileId: id, items, nextCursor: page.nextCursor };
    },
  );

  /** Switch profile → scoped outfits (only those using profile-scoped items). */
  app.get(
    "/closet-profiles/:id/outfits",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["closet-profiles"],
        params: z.object({ id: z.string().uuid() }),
        querystring: PageQuerySchema,
        response: {
          200: ClosetProfileOutfitsResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const q = request.query as PageQuery;
      let after;
      try {
        after = decodeCursor(q.cursor);
      } catch (err) {
        if (err instanceof InvalidCursorError) return reply.code(400).send(err.body);
        throw err;
      }
      const profile = await app.deps.repos.findClosetProfile(id);
      if (denyUnlessOwnsProfile(profile, userId)) return reply.code(404).send(PROFILE_NOT_FOUND);
      // The repo keeps only outfits made entirely of this profile's (non-discarded) items.
      const page = await app.deps.repos.listOutfitsPage(userId, { limit: q.limit, after, profileId: id });
      trackServerEvent("closet_profile_outfits_viewed", { userId, profileId: id });
      return {
        profileId: id,
        outfits: page.items.map(toOutfitJson),
        nextCursor: page.nextCursor,
      };
    },
  );
};
