import {
  CreateSwapCircleBodySchema,
  CreateSwapListingBodySchema,
  JoinSwapCircleBodySchema,
  SwapCircleDetailResponseSchema,
  SwapCircleListResponseSchema,
  SwapCircleSchema,
  SwapInviteResponseSchema,
  SwapListingSchema,
  SwapListingsResponseSchema,
  buildSwapInvitePayload,
  denyUnlessCanBorrow,
  denyUnlessCanReturn,
  denyUnlessCircleMember,
  generateSwapInviteCode,
  normalizeSwapInviteCode,
  type CreateSwapCircleBody,
  type CreateSwapListingBody,
  type JoinSwapCircleBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import type {
  SwapCircleMemberRecord,
  SwapCircleRecord,
  SwapListingRecord,
} from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toCircleJson(c: SwapCircleRecord, memberCount?: number) {
  return {
    id: c.id,
    name: c.name,
    ownerId: c.ownerId,
    inviteCode: c.inviteCode,
    memberCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toMemberJson(m: SwapCircleMemberRecord) {
  return {
    id: m.id,
    circleId: m.circleId,
    userId: m.userId,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function toListingJson(l: SwapListingRecord) {
  return {
    id: l.id,
    circleId: l.circleId,
    ownerUserId: l.ownerUserId,
    wardrobeItemId: l.wardrobeItemId,
    dispositionListingId: l.dispositionListingId,
    status: l.status,
    borrowerUserId: l.borrowerUserId,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function authzMessage(reason: string): string {
  switch (reason) {
    case "NOT_MEMBER":
      return "Not a member of this swap circle";
    case "OWN_ITEM":
      return "Cannot borrow your own listing";
    case "NOT_LISTED":
      return "Listing is not available to borrow";
    case "NOT_BORROWER":
      return "Only borrower or owner can return this item";
    case "WRONG_STATUS":
      return "Listing is not currently borrowed";
    default:
      return "Forbidden";
  }
}

export const swapCircleRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /swap-circles — create invite-only circle
  app.post(
    "/swap-circles",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        body: CreateSwapCircleBodySchema,
        response: { 201: SwapCircleSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateSwapCircleBody;
      let inviteCode = generateSwapInviteCode(8);
      for (let i = 0; i < 5; i++) {
        const clash = await app.deps.repos.findSwapCircleByInviteCode(inviteCode);
        if (!clash) break;
        inviteCode = generateSwapInviteCode(8);
      }
      const circle = await app.deps.repos.createSwapCircle({
        name: body.name.trim(),
        ownerId: userId,
        inviteCode,
      });
      await app.deps.repos.addSwapCircleMember({
        circleId: circle.id,
        userId,
        role: "OWNER",
      });
      trackServerEvent("swap_circle_created", { userId, circleId: circle.id });
      return reply.code(201).send(toCircleJson(circle, 1));
    },
  );

  // GET /swap-circles — circles I belong to
  app.get(
    "/swap-circles",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        response: { 200: SwapCircleListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const circles = await app.deps.repos.listSwapCirclesForUser(userId);
      const withCounts = await Promise.all(
        circles.map(async (c) => {
          const members = await app.deps.repos.listSwapCircleMembers(c.id);
          return toCircleJson(c, members.length);
        }),
      );
      return { circles: withCounts };
    },
  );

  // POST /swap-circles/join — join via invite code
  app.post(
    "/swap-circles/join",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        body: JoinSwapCircleBodySchema,
        response: {
          200: SwapCircleDetailResponseSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as JoinSwapCircleBody;
      const code = normalizeSwapInviteCode(body.inviteCode);
      const circle = await app.deps.repos.findSwapCircleByInviteCode(code);
      if (!circle) {
        return reply.code(404).send({ error: "Not Found", message: "Invalid invite code" });
      }
      await app.deps.repos.addSwapCircleMember({
        circleId: circle.id,
        userId,
        role: circle.ownerId === userId ? "OWNER" : "MEMBER",
      });
      const members = await app.deps.repos.listSwapCircleMembers(circle.id);
      const me = members.find((m) => m.userId === userId)!;
      trackServerEvent("swap_circle_joined", { userId, circleId: circle.id });
      return {
        circle: toCircleJson(circle, members.length),
        members: members.map(toMemberJson),
        role: me.role,
      };
    },
  );

  // GET /swap-circles/:id
  app.get(
    "/swap-circles/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: SwapCircleDetailResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const circle = await app.deps.repos.findSwapCircleById(id);
      if (!circle) {
        return reply.code(404).send({ error: "Not Found", message: "Swap circle not found" });
      }
      const members = await app.deps.repos.listSwapCircleMembers(id);
      const denial = denyUnlessCircleMember(members, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      const me = members.find((m) => m.userId === userId)!;
      return {
        circle: toCircleJson(circle, members.length),
        members: members.map(toMemberJson),
        role: me.role,
      };
    },
  );

  // GET /swap-circles/:id/invite
  app.get(
    "/swap-circles/:id/invite",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: SwapInviteResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const circle = await app.deps.repos.findSwapCircleById(id);
      if (!circle) {
        return reply.code(404).send({ error: "Not Found", message: "Swap circle not found" });
      }
      const members = await app.deps.repos.listSwapCircleMembers(id);
      const denial = denyUnlessCircleMember(members, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      return buildSwapInvitePayload(circle.inviteCode);
    },
  );

  // GET /swap-circles/:id/listings
  app.get(
    "/swap-circles/:id/listings",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: SwapListingsResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const circle = await app.deps.repos.findSwapCircleById(id);
      if (!circle) {
        return reply.code(404).send({ error: "Not Found", message: "Swap circle not found" });
      }
      const members = await app.deps.repos.listSwapCircleMembers(id);
      const denial = denyUnlessCircleMember(members, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      const listings = await app.deps.repos.listSwapListings(id);
      return { listings: listings.map(toListingJson) };
    },
  );

  // POST /swap-circles/:id/listings — list wardrobe item privately to circle (BARTER disposition)
  app.post(
    "/swap-circles/:id/listings",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        params: z.object({ id: z.string().uuid() }),
        body: CreateSwapListingBodySchema,
        response: {
          201: SwapListingSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as CreateSwapListingBody;
      const circle = await app.deps.repos.findSwapCircleById(id);
      if (!circle) {
        return reply.code(404).send({ error: "Not Found", message: "Swap circle not found" });
      }
      const members = await app.deps.repos.listSwapCircleMembers(id);
      const denial = denyUnlessCircleMember(members, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      const item = await app.deps.repos.findWardrobeItem(body.wardrobeItemId, userId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      // Private BARTER disposition — no public marketplace rails
      const disposition = await app.deps.repos.createDispositionListing({
        userId,
        wardrobeItemId: body.wardrobeItemId,
        mode: "BARTER",
        priceMinor: null,
        sellerId: null,
      });
      const listing = await app.deps.repos.createSwapListing({
        circleId: id,
        ownerUserId: userId,
        wardrobeItemId: body.wardrobeItemId,
        dispositionListingId: disposition.id,
      });
      trackServerEvent("swap_listing_created", {
        userId,
        circleId: id,
        wardrobeItemId: body.wardrobeItemId,
      });
      return reply.code(201).send(toListingJson(listing));
    },
  );

  // POST /swap-circles/:id/listings/:listingId/borrow — accept/borrow
  app.post(
    "/swap-circles/:id/listings/:listingId/borrow",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        params: z.object({ id: z.string().uuid(), listingId: z.string().uuid() }),
        response: {
          200: SwapListingSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id, listingId } = request.params;
      const circle = await app.deps.repos.findSwapCircleById(id);
      if (!circle) {
        return reply.code(404).send({ error: "Not Found", message: "Swap circle not found" });
      }
      const members = await app.deps.repos.listSwapCircleMembers(id);
      const listing = await app.deps.repos.findSwapListing(listingId, id);
      if (!listing) {
        return reply.code(404).send({ error: "Not Found", message: "Swap listing not found" });
      }
      const denial = denyUnlessCanBorrow(members, listing, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      const updated = await app.deps.repos.updateSwapListing(listingId, {
        status: "BORROWED",
        borrowerUserId: userId,
      });
      if (listing.dispositionListingId) {
        await app.deps.repos.updateDispositionListing(listing.dispositionListingId, {
          status: "BARTERED",
        });
      }
      trackServerEvent("swap_listing_borrowed", {
        userId,
        circleId: id,
        listingId,
      });
      return toListingJson(updated!);
    },
  );

  // POST /swap-circles/:id/listings/:listingId/return
  app.post(
    "/swap-circles/:id/listings/:listingId/return",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["swap-circles"],
        params: z.object({ id: z.string().uuid(), listingId: z.string().uuid() }),
        response: {
          200: SwapListingSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id, listingId } = request.params;
      const circle = await app.deps.repos.findSwapCircleById(id);
      if (!circle) {
        return reply.code(404).send({ error: "Not Found", message: "Swap circle not found" });
      }
      const members = await app.deps.repos.listSwapCircleMembers(id);
      const listing = await app.deps.repos.findSwapListing(listingId, id);
      if (!listing) {
        return reply.code(404).send({ error: "Not Found", message: "Swap listing not found" });
      }
      const denial = denyUnlessCanReturn(members, listing, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      const updated = await app.deps.repos.updateSwapListing(listingId, {
        status: "RETURNED",
      });
      trackServerEvent("swap_listing_returned", {
        userId,
        circleId: id,
        listingId,
      });
      return toListingJson(updated!);
    },
  );
};
