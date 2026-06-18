import { randomUUID } from "node:crypto";
import {
  SellerListingCreateResponseSchema,
  SellerListingsResponseSchema,
  SellerRegisterBodySchema,
  SellerRegisterResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { listingCardDto } from "../lib/catalog/urls.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function parseTags(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export const sellersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/sellers/register",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["sellers"],
        body: SellerRegisterBodySchema,
        response: {
          201: SellerRegisterResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const seller = await app.deps.repos.registerSeller(userId, request.body.shopName);
      return reply.code(201).send({ id: seller.id, shopName: seller.shopName });
    },
  );

  app.post(
    "/sellers/listings",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["sellers"],
        consumes: ["multipart/form-data"],
        response: {
          201: SellerListingCreateResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const seller = await app.deps.repos.findSellerByUserId(userId);
      if (!seller) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Register as a seller before creating listings",
        });
      }

      const parts = request.files();
      const productImageKeys: string[] = [];
      let title = "";
      let category = "";
      let tagsRaw = "";
      let coinPrice = 0;
      let size = "M";
      let color = "Default";
      let affiliateUrl: string | null = null;

      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          if (buffer.length === 0) continue;

          const key = `products/${seller.id}/${randomUUID()}.jpg`;
          await app.deps.storage.put({
            key,
            body: buffer,
            contentType: part.mimetype || "image/jpeg",
          });
          productImageKeys.push(key);
          continue;
        }

        const value = part.value as string;
        switch (part.fieldname) {
          case "title":
            title = value;
            break;
          case "category":
            category = value;
            break;
          case "tags":
            tagsRaw = value;
            break;
          case "coinPrice":
            coinPrice = Number.parseInt(value, 10);
            break;
          case "size":
            size = value;
            break;
          case "color":
            color = value;
            break;
          case "affiliateUrl":
            affiliateUrl = value || null;
            break;
          default:
            break;
        }
      }

      if (!title || !category || productImageKeys.length === 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "title, category, and at least one product photo are required",
        });
      }

      if (!Number.isFinite(coinPrice) || coinPrice < 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "coinPrice must be a non-negative integer",
        });
      }

      const houseModelRenderKey = productImageKeys[0]!;
      const garmentImageKey = productImageKeys[0]!;

      const { listing, variant } = await app.deps.repos.createSellerListing({
        sellerId: seller.id,
        title,
        category,
        tags: parseTags(tagsRaw),
        coinPrice,
        productImageKeys,
        houseModelRenderKey,
        affiliateUrl,
        variant: { size, color, garmentImageKey },
      });

      return reply.code(201).send({ listingId: listing.id, variantId: variant.id });
    },
  );

  app.get(
    "/sellers/listings",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["sellers"],
        response: {
          200: SellerListingsResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const seller = await app.deps.repos.findSellerByUserId(userId);
      if (!seller) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Register as a seller to view your listings",
        });
      }

      const page = await app.deps.repos.listListings({
        sellerId: seller.id,
        limit: 100,
      });
      const items = await Promise.all(
        page.items.map((listing) =>
          listingCardDto(listing, app.deps.storage, app.deps.repos),
        ),
      );

      return { items };
    },
  );
};
