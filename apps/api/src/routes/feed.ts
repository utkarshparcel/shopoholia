import {
  FeedQuerySchema,
  FeedResponseSchema,
  ListingDetailSchema,
  ListingParamsSchema,
  TryonRequestSchema,
  TryonResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { listingCardDto, listingDetailDto } from "../lib/catalog/urls.js";
import { newJobId } from "../lib/jobs/avatar-processing.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const feedRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/feed",
    {
      schema: {
        tags: ["feed"],
        querystring: FeedQuerySchema,
        response: {
          200: FeedResponseSchema,
        },
      },
    },
    async (request) => {
      const { cursor, limit, seller_id: sellerId } = request.query;
      const page = await app.deps.repos.listListings({ cursor, limit, sellerId });
      const items = await Promise.all(
        page.items.map((listing) =>
          listingCardDto(listing, app.deps.storage, app.deps.repos),
        ),
      );
      return { items, nextCursor: page.nextCursor };
    },
  );

  app.get(
    "/listings/:id",
    {
      schema: {
        tags: ["feed"],
        params: ListingParamsSchema,
        response: {
          200: ListingDetailSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const listing = await app.deps.repos.findListingById(request.params.id);
      if (!listing || listing.status !== "ACTIVE") {
        return reply.code(404).send({ error: "Not Found", message: "Listing not found" });
      }
      const variants = await app.deps.repos.findVariantsByListingId(listing.id);
      return listingDetailDto(listing, variants, app.deps.storage, app.deps.repos);
    },
  );

  app.post(
    "/listings/:id/tryon",
    {
      schema: {
        tags: ["feed"],
        params: ListingParamsSchema,
        body: TryonRequestSchema,
        response: {
          200: TryonResponseSchema,
          202: TryonResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const listing = await app.deps.repos.findListingById(request.params.id);
      if (!listing || listing.status !== "ACTIVE") {
        return reply.code(404).send({ error: "Not Found", message: "Listing not found" });
      }

      const variant = await app.deps.repos.findVariantById(request.body.variantId);
      if (!variant || variant.listingId !== listing.id) {
        return reply.code(404).send({ error: "Not Found", message: "Variant not found" });
      }

      const avatar = await app.deps.repos.findAvatarByUserId(userId);
      if (!avatar?.referenceImageKey || avatar.status !== "READY") {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Avatar must be ready before try-on",
        });
      }

      const cached = await app.deps.repos.findTryonPreview(userId, variant.id);
      if (cached?.status === "READY" && cached.imageKey) {
        return {
          status: "READY" as const,
          previewUrl: await app.deps.storage.getSignedUrl(cached.imageKey),
        };
      }
      if (cached?.status === "PROCESSING") {
        return reply.code(202).send({ status: "PROCESSING" as const, previewUrl: null });
      }

      await app.deps.repos.upsertTryonPreview({
        userId,
        listingVariantId: variant.id,
        imageKey: null,
        status: "PROCESSING",
        provider: app.deps.renderProvider.name,
        costMicros: 0,
      });

      await app.deps.jobQueue.enqueueTryonProcessing({
        jobId: newJobId(),
        userId,
        listingVariantId: variant.id,
        modelImageKey: avatar.referenceImageKey,
        garmentImageKey: variant.garmentImageKey,
      });

      return reply.code(202).send({ status: "PROCESSING" as const, previewUrl: null });
    },
  );
};
