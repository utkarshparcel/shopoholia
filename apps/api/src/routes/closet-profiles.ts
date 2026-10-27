import {
  ClosetProfileListResponseSchema,
  ClosetProfileOutfitsResponseSchema,
  ClosetProfileSchema,
  ClosetProfileWardrobeResponseSchema,
  CreateClosetProfileBodySchema,
  UpdateClosetProfileBodySchema,
  careRulesOrNull,
  defaultSelfProfileName,
  denyUnlessOwnsProfile,
  filterByClosetProfile,
  type CreateClosetProfileBody,
  type UpdateClosetProfileBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import type { ClosetProfileRecord, OutfitRecord, WardrobeItemRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

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
        await app.deps.repos.createClosetProfile({
          ownerUserId: userId,
          name: defaultSelfProfileName(),
          kind: "SELF",
        });
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
        response: { 201: ClosetProfileSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateClosetProfileBody;
      if (body.householdId) {
        const member = await app.deps.repos.findHouseholdMember(body.householdId, userId);
        if (!member) {
          return reply
            .code(400)
            .send({ error: "Bad Request", message: "Not a member of that household" });
        }
      }
      const profile = await app.deps.repos.createClosetProfile({
        ownerUserId: userId,
        name: body.name.trim(),
        kind: body.kind ?? "KID",
        householdId: body.householdId ?? null,
      });
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
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as UpdateClosetProfileBody;
      const existing = await app.deps.repos.findClosetProfile(id);
      const denial = denyUnlessOwnsProfile(existing, userId);
      if (denial === "NOT_FOUND") {
        return reply.code(404).send({ error: "Not Found", message: "Profile not found" });
      }
      if (denial === "FORBIDDEN") {
        return reply.code(403).send({ error: "Forbidden", message: "Not your profile" });
      }
      const updated = await app.deps.repos.updateClosetProfile(id, userId, {
        name: body.name?.trim(),
        kind: body.kind,
      });
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Profile not found" });
      }
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
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const existing = await app.deps.repos.findClosetProfile(id);
      const denial = denyUnlessOwnsProfile(existing, userId);
      if (denial === "NOT_FOUND") {
        return reply.code(404).send({ error: "Not Found", message: "Profile not found" });
      }
      if (denial === "FORBIDDEN") {
        return reply.code(403).send({ error: "Forbidden", message: "Not your profile" });
      }
      if (existing!.kind === "SELF") {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "Cannot delete SELF profile" });
      }
      await app.deps.repos.deleteClosetProfile(id, userId);
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
        response: {
          200: ClosetProfileWardrobeResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const profile = await app.deps.repos.findClosetProfile(id);
      const denial = denyUnlessOwnsProfile(profile, userId);
      if (denial === "NOT_FOUND") {
        return reply.code(404).send({ error: "Not Found", message: "Profile not found" });
      }
      if (denial === "FORBIDDEN") {
        return reply.code(403).send({ error: "Forbidden", message: "Not your profile" });
      }
      const all = await app.deps.repos.listWardrobeItems(userId);
      const scoped = filterByClosetProfile(all, id);
      const withUrls = await Promise.all(
        scoped.map(async (r) => {
          const imageUrls = await Promise.all(
            (r.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
          );
          const garmentImageUrl = r.garmentImageKey
            ? await app.deps.storage.getSignedUrl(r.garmentImageKey)
            : null;
          return toWardrobeJson(r, imageUrls, garmentImageUrl);
        }),
      );
      trackServerEvent("closet_profile_wardrobe_viewed", { userId, profileId: id });
      return { profileId: id, items: withUrls };
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
        response: {
          200: ClosetProfileOutfitsResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const profile = await app.deps.repos.findClosetProfile(id);
      const denial = denyUnlessOwnsProfile(profile, userId);
      if (denial === "NOT_FOUND") {
        return reply.code(404).send({ error: "Not Found", message: "Profile not found" });
      }
      if (denial === "FORBIDDEN") {
        return reply.code(403).send({ error: "Forbidden", message: "Not your profile" });
      }
      const allItems = await app.deps.repos.listWardrobeItems(userId);
      const scopedIds = new Set(filterByClosetProfile(allItems, id).map((i) => i.id));
      const outfits = await app.deps.repos.listOutfits(userId);
      const scopedOutfits = outfits.filter(
        (o) => o.itemIds.length > 0 && o.itemIds.every((iid) => scopedIds.has(iid)),
      );
      trackServerEvent("closet_profile_outfits_viewed", { userId, profileId: id });
      return {
        profileId: id,
        outfits: scopedOutfits.map(toOutfitJson),
      };
    },
  );
};
