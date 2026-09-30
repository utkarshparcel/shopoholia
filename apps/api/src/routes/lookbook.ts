import { LookbookParamsSchema, LookbookResponseSchema } from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { listingCardDto } from "../lib/catalog/urls.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const lookbookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/lookbook",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["lookbook"],
        response: {
          200: LookbookResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const saved = await app.deps.repos.listLookbookListings(request.user.sub);
      // Saves are kept when a listing leaves the feed, but only live listings are shown.
      const active = saved.filter((listing) => listing.status === "ACTIVE");
      const sellerIds = [
        ...new Set(active.flatMap((listing) => (listing.sellerId ? [listing.sellerId] : []))),
      ];
      const sellers = await app.deps.repos.findSellersByIds(sellerIds);
      const sellerMap = new Map(sellers.map((seller) => [seller.id, seller]));
      const items = await Promise.all(
        active.map((listing) =>
          listingCardDto(listing, app.deps.storage, app.deps.repos, sellerMap),
        ),
      );
      return { items };
    },
  );

  app.put(
    "/lookbook/:listingId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["lookbook"],
        params: LookbookParamsSchema,
        response: {
          204: z.null(),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { listingId } = request.params;
      const listing = await app.deps.repos.findListingById(listingId);
      if (!listing || listing.status !== "ACTIVE") {
        return reply.code(404).send({ error: "Not Found", message: "Listing not found" });
      }

      await app.deps.repos.saveLookbookItem(request.user.sub, listingId);
      return reply.code(204).send(null);
    },
  );

  app.delete(
    "/lookbook/:listingId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["lookbook"],
        params: LookbookParamsSchema,
        response: {
          204: z.null(),
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await app.deps.repos.removeLookbookItem(request.user.sub, request.params.listingId);
      return reply.code(204).send(null);
    },
  );
};
