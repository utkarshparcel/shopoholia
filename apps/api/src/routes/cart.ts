import {
  AddToCartBodySchema,
  CartResponseSchema,
  RemoveFromCartBodySchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { listingCardDto } from "../lib/catalog/urls.js";
import type { AppDeps } from "../lib/deps.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

async function buildCartResponse(deps: AppDeps, userId: string) {
  const cart = await deps.repos.getOrCreateCart(userId);
  const rows = await deps.repos.getCartItems(cart.id);
  const items = [];

  for (const row of rows) {
    const variant = await deps.repos.findVariantById(row.listingVariantId);
    if (!variant) continue;
    const listing = await deps.repos.findListingById(variant.listingId);
    if (!listing) continue;

    const card = await listingCardDto(listing, deps.storage, deps.repos);
    items.push({
      variantId: variant.id,
      listingId: listing.id,
      title: listing.title,
      size: variant.size,
      color: variant.color,
      coinPriceSnapshot: row.coinPriceSnapshot,
      quantity: row.quantity,
      imageUrl: card.houseModelImageUrl,
    });
  }

  const coinTotal = items.reduce(
    (sum, item) => sum + item.coinPriceSnapshot * item.quantity,
    0,
  );

  return { items, coinTotal };
}

export const cartRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/cart",
    {
      schema: {
        tags: ["cart"],
        response: {
          200: CartResponseSchema,
          401: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request) => buildCartResponse(app.deps, request.user.sub),
  );

  app.post(
    "/cart",
    {
      schema: {
        tags: ["cart"],
        body: AddToCartBodySchema,
        response: {
          200: CartResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { variantId, quantity } = request.body;
      const variant = await app.deps.repos.findVariantById(variantId);
      if (!variant) {
        return reply.code(404).send({ error: "Not Found", message: "Variant not found" });
      }

      const listing = await app.deps.repos.findListingById(variant.listingId);
      if (!listing || listing.status !== "ACTIVE") {
        return reply.code(404).send({ error: "Not Found", message: "Listing not found" });
      }

      const cart = await app.deps.repos.getOrCreateCart(userId);
      await app.deps.repos.addCartItem({
        cartId: cart.id,
        listingVariantId: variant.id,
        coinPriceSnapshot: listing.coinPrice,
        quantity,
      });

      return buildCartResponse(app.deps, userId);
    },
  );

  app.delete(
    "/cart",
    {
      schema: {
        tags: ["cart"],
        body: RemoveFromCartBodySchema,
        response: {
          200: CartResponseSchema,
          401: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const userId = request.user.sub;
      const cart = await app.deps.repos.getOrCreateCart(userId);
      await app.deps.repos.removeCartItem(cart.id, request.body.variantId);
      return buildCartResponse(app.deps, userId);
    },
  );
};
