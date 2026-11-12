import {
  FeedCategoriesResponseSchema,
  FeedQuerySchema,
  FeedResponseSchema,
  ListingDetailSchema,
  ListingParamsSchema,
  TryonRequestSchema,
  TryonResponseSchema,
} from "@worn/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { optionalUserId, requireAuth } from "../lib/auth/guard.js";
import { styleKeywordsForTags } from "../lib/catalog/style-match.js";
import { listingCardDto, listingDetailDto } from "../lib/catalog/urls.js";
import { RENDER_CLAIM_STALE_MS } from "../jobs/wardrobe-tryon.js";
import { newJobId } from "../lib/jobs/avatar-processing.js";
import { tryonWaitEstimate } from "../lib/render/agent-jobs.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const feedRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Signed-in viewers who took the style quiz get listings matching it first. */
  async function viewerStyleKeywords(request: FastifyRequest): Promise<string[]> {
    const userId = await optionalUserId(request);
    if (!userId) return [];
    const user = await app.deps.repos.findUserById(userId);
    return user?.styleProfile ? styleKeywordsForTags(user.styleProfile.tags) : [];
  }

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
      const { cursor, limit, seller_id: sellerId, category } = request.query;
      const page = await app.deps.repos.listListings({
        cursor,
        limit,
        sellerId,
        category,
        styleKeywords: await viewerStyleKeywords(request),
      });
      const sellerIds = [
        ...new Set(page.items.flatMap((listing) => (listing.sellerId ? [listing.sellerId] : []))),
      ];
      const sellers = await app.deps.repos.findSellersByIds(sellerIds);
      const sellerMap = new Map(sellers.map((seller) => [seller.id, seller]));
      const items = await Promise.all(
        page.items.map((listing) =>
          listingCardDto(listing, app.deps.storage, app.deps.repos, sellerMap),
        ),
      );
      return { items, nextCursor: page.nextCursor };
    },
  );

  app.get(
    "/feed/categories",
    {
      schema: {
        tags: ["feed"],
        response: {
          200: FeedCategoriesResponseSchema,
        },
      },
    },
    async () => ({ categories: await app.deps.repos.listListingCategories() }),
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

      // One row per (user, variant): a READY, a fresh PROCESSING and a FAILED before its
      // retryAfter are not claimed again, so retries and double taps render once.
      const { claimed, preview } = await app.deps.repos.claimTryonPreview({
        userId,
        listingVariantId: variant.id,
        provider: app.deps.renderProvider.name,
        staleBefore: new Date(Date.now() - RENDER_CLAIM_STALE_MS),
      });
      if (claimed) {
        try {
          await app.deps.jobQueue.enqueueTryonProcessing({
            jobId: newJobId(),
            userId,
            listingVariantId: variant.id,
            modelImageKey: avatar.referenceImageKey,
            garmentImageKey: variant.garmentImageKey,
          });
        } catch (err) {
          // Not queued: release the claim so the next ask can try again in a minute.
          await app.deps.repos.upsertTryonPreview({
            userId,
            listingVariantId: variant.id,
            imageKey: null,
            status: "FAILED",
            error: "Could not queue the render",
            retryAfter: new Date(Date.now() + 60_000),
            provider: app.deps.renderProvider.name,
            costMicros: 0,
          });
          throw err;
        }
      }

      if (preview.status === "READY" && preview.imageKey) {
        return {
          status: "READY" as const,
          previewUrl: await app.deps.storage.getSignedUrl(preview.imageKey),
        };
      }
      if (preview.status === "FAILED") {
        return {
          status: "FAILED" as const,
          previewUrl: null,
          retryAfter: preview.retryAfter?.toISOString() ?? null,
        };
      }
      // With the render agent, a preview can wait (overnight, or while the Mac is down): say until when.
      const wait = await tryonWaitEstimate({ repos: app.deps.repos, config: app.deps.renderConfig }, preview);
      return reply.code(202).send({
        status: "PROCESSING" as const,
        previewUrl: null,
        rendersWaiting: wait.waiting,
        expectedReadyAt: wait.expectedReadyAt,
      });
    },
  );
};
