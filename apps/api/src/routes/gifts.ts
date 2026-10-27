import {
  CreateGiftOrderBodySchema,
  CreateGroupContributeBodySchema,
  CreateRecipientBodySchema,
  DEFAULT_GIFT_IDEA_LIMIT,
  FestivalsResponseSchema,
  GiftOrderResponseSchema,
  GroupContributeResponseSchema,
  GroupGiftContributionSchema,
  RecipientSchema,
  RecipientsResponseSchema,
  RecipientIdeasResponseSchema,
  UpdateWishlistBodySchema,
  normalizeWishlist,
  rankGiftIdeas,
  isFitRegionPackId,
  normalizeFitRegionPack,
  type CreateGiftOrderBody,
  type CreateGroupContributeBody,
  type CreateRecipientBody,
  type UpdateWishlistBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { audit } from "../lib/audit.js";
import { scheduleGiftOccasionReminders } from "../lib/gift-jobs.js";
import { computeNextOccasion, indianFestivalDates } from "../lib/festivals.js";
import { regionFestivalDates } from "../lib/region-pack-defaults.js";
import {
  buildGiftDeadlineBoard,
  GIFT_DEADLINE_LEAD_DAYS,
  lockShortlistOfThree,
  setGiftBudgetLock,
  computeGiftDeadlineReminderDelayMs,
  giftDeadlineReminderJobId,
} from "../lib/gift-deadline.js";
import type {
  GiftOrderRecord,
  GroupGiftContributionRecord,
  RecipientProfileRecord,
  RecipientRecord,
} from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toRecipientJson(r: RecipientRecord, profile: RecipientProfileRecord | null) {
  const next = profile?.importantDates?.length
    ? computeNextOccasion(profile.importantDates)
    : null;
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    relationship: r.relationship,
    region: r.region,
    profile: profile
      ? {
          id: profile.id,
          recipientId: profile.recipientId,
          sizes: profile.sizes,
          tasteTags: profile.tasteTags,
          wishlist: normalizeWishlist(profile.wishlist),
          importantDates: profile.importantDates,
          notes: profile.notes,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
    nextOccasionDate: next?.date ?? null,
    nextOccasionLabel: next?.label ?? null,
    daysUntil: next?.daysUntil ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toGiftJson(order: GiftOrderRecord, contributedMinor?: number) {
  return {
    id: order.id,
    userId: order.userId,
    recipientId: order.recipientId,
    listingId: order.listingId,
    occasion: order.occasion,
    status: order.status,
    affiliateLink: order.affiliateLink,
    wrapMessage: order.wrapMessage,
    groupTargetMinor: order.groupTargetMinor,
    groupCurrency: order.groupCurrency,
    contributedMinor: contributedMinor ?? undefined,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function toContributionJson(c: GroupGiftContributionRecord) {
  return {
    id: c.id,
    giftOrderId: c.giftOrderId,
    contributorUserId: c.contributorUserId,
    contributorName: c.contributorName,
    amountMinor: c.amountMinor,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export const giftsRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /gifts/festivals?region=IN — optional IN festival seed helper
  app.get(
    "/gifts/festivals",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        querystring: z.object({ region: z.string().optional() }),
        response: { 200: FestivalsResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const { region } = request.query as { region?: string };
      const r = (region ?? "IN").toUpperCase();
      if (isFitRegionPackId(r)) {
        return { region: r, festivals: regionFestivalDates(normalizeFitRegionPack(r)) };
      }
      const festivals = r === "IN" ? indianFestivalDates() : [];
      return { region: r, festivals };
    },
  );

  // GET /recipients
  app.get(
    "/recipients",
    {
      preHandler: requireAuth,
      schema: { tags: ["gifts"], response: { 200: RecipientsResponseSchema, 401: ErrorSchema } },
    },
    async (request) => {
      const userId = request.user!.sub;
      const recipients = await app.deps.repos.listRecipients(userId);
      const withProfiles = await Promise.all(
        recipients.map(async (r) => {
          const p = await app.deps.repos.findRecipientProfile(r.id);
          return toRecipientJson(r, p);
        }),
      );
      return { recipients: withProfiles };
    },
  );

  // POST /recipients
  app.post(
    "/recipients",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        body: CreateRecipientBodySchema,
        response: { 201: RecipientSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateRecipientBody;
      const profile = body.profile
        ? {
            ...body.profile,
            wishlist: normalizeWishlist(body.profile.wishlist ?? []),
          }
        : undefined;
      const recipient = await app.deps.repos.createRecipient({
        userId,
        name: body.name,
        relationship: body.relationship ?? "OTHER",
        region: body.region ?? "IN",
        profile,
      });
      const savedProfile = await app.deps.repos.findRecipientProfile(recipient.id);
      if (savedProfile?.importantDates?.length) {
        await scheduleGiftOccasionReminders({
          userId,
          recipientId: recipient.id,
          importantDates: savedProfile.importantDates,
        });
      }
      trackServerEvent("recipient_created", { userId, recipientId: recipient.id });
      return reply.code(201).send(toRecipientJson(recipient, savedProfile));
    },
  );

  // PUT /recipients/:id/wishlist — set structured wishlist refs
  app.put(
    "/recipients/:id/wishlist",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        params: z.object({ id: z.string().uuid() }),
        body: UpdateWishlistBodySchema,
        response: { 200: RecipientSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as UpdateWishlistBody;
      const recipient = await app.deps.repos.findRecipient(id, userId);
      if (!recipient) return reply.code(404).send({ error: "Not Found", message: "Recipient not found" });
      const wishlist = normalizeWishlist(body.wishlist);
      await app.deps.repos.upsertRecipientProfile({ recipientId: id, wishlist });
      const profile = await app.deps.repos.findRecipientProfile(id);
      trackServerEvent("wishlist_updated", { userId, recipientId: id, count: wishlist.length });
      return toRecipientJson(recipient, profile);
    },
  );

  // GET /recipients/:id/ideas?budgetCap= — WV07-RANK-BUDGET: top 3 in budget
  app.get(
    "/recipients/:id/ideas",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        params: z.object({ id: z.string().uuid() }),
        querystring: z.object({
          budgetCap: z.coerce.number().int().nonnegative().optional(),
        }),
        response: { 200: RecipientIdeasResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const { budgetCap } = request.query as { budgetCap?: number };
      const recipient = await app.deps.repos.findRecipient(id, userId);
      if (!recipient) return reply.code(404).send({ error: "Not Found", message: "Recipient not found" });
      const profile = await app.deps.repos.findRecipientProfile(id);
      const taste = profile?.tasteTags ?? [];
      const wishlistTitles = normalizeWishlist(profile?.wishlist ?? []).map((w) => w.title);
      const all = await app.deps.repos.listListings({ limit: 50 });
      const ideas = rankGiftIdeas({
        listings: all.items.map((l) => ({
          id: l.id,
          title: l.title,
          category: l.category,
          tags: l.tags,
          coinPrice: l.coinPrice,
          affiliateUrl: l.affiliateUrl,
        })),
        tasteTags: taste,
        wishlistTitles,
        budgetCap: budgetCap ?? null,
        limit: DEFAULT_GIFT_IDEA_LIMIT,
      });
      trackServerEvent("gift_idea_viewed", { userId, recipientId: id, ideaCount: ideas.length });
      return {
        recipientId: id,
        budgetCap: budgetCap ?? null,
        ideas,
      };
    },
  );

  // POST /gifts (affiliate order + optional wrap / group pool)
  app.post(
    "/gifts",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        body: CreateGiftOrderBodySchema,
        response: { 201: GiftOrderResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateGiftOrderBody;
      const recipient = await app.deps.repos.findRecipient(body.recipientId, userId);
      if (!recipient) return reply.code(404).send({ error: "Not Found", message: "Recipient not found" });
      let affiliateLink: string | null = body.affiliateLink ?? null;
      const listingId: string | null = body.listingId ?? null;
      if (listingId) {
        const listing = await app.deps.repos.findListingById(listingId);
        if (!listing) return reply.code(404).send({ error: "Not Found", message: "Listing not found" });
        affiliateLink = affiliateLink ?? listing.affiliateUrl ?? null;
        if (affiliateLink) {
          const platform = (() => {
            try {
              const u = new URL(affiliateLink!);
              if (u.hostname.includes("amazon")) return "amazon";
              if (u.hostname.includes("flipkart")) return "flipkart";
              if (u.hostname.includes("myntra")) return "myntra";
              if (u.hostname.includes("ajio")) return "ajio";
              if (u.hostname.includes("nykaa")) return "nykaa";
              return "other";
            } catch {
              return "other";
            }
          })();
          const clickId = `gift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          await app.deps.repos.recordCashbackEvent({ userId, listingId, platform, clickId });
        }
      }
      const order = await app.deps.repos.createGiftOrder({
        userId,
        recipientId: body.recipientId,
        listingId,
        occasion: body.occasion ?? null,
        affiliateLink,
        wrapMessage: body.wrapMessage ?? null,
        groupTargetMinor: body.groupTargetMinor ?? null,
        groupCurrency:
          body.groupTargetMinor != null ? (body.groupCurrency ?? "INR") : (body.groupCurrency ?? null),
      });
      trackServerEvent("gift_ordered", {
        userId,
        recipientId: body.recipientId,
        giftOrderId: order.id,
        group: order.groupTargetMinor != null,
      });
      return reply.code(201).send(toGiftJson(order, 0));
    },
  );

  // GET /gifts (list gift orders for user)
  app.get(
    "/gifts",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        response: { 200: z.object({ gifts: z.array(GiftOrderResponseSchema) }), 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const gifts = await app.deps.repos.listGiftOrders(userId);
      const withSums = await Promise.all(
        gifts.map(async (g) => {
          const contributedMinor = g.groupTargetMinor != null
            ? await app.deps.repos.sumGroupGiftContributions(g.id)
            : undefined;
          return toGiftJson(g, contributedMinor);
        }),
      );
      return { gifts: withSums };
    },
  );

  // GET /gifts/:id
  app.get(
    "/gifts/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            gift: GiftOrderResponseSchema,
            contributions: z.array(GroupGiftContributionSchema),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const order = await app.deps.repos.findGiftOrder(id, userId);
      if (!order) return reply.code(404).send({ error: "Not Found", message: "Gift order not found" });
      const contributions = await app.deps.repos.listGroupGiftContributions(id);
      const contributedMinor = contributions.reduce((s, c) => s + c.amountMinor, 0);
      return {
        gift: toGiftJson(order, contributedMinor),
        contributions: contributions.map(toContributionJson),
      };
    },
  );

  // POST /gifts/:id/contribute — group gifting stub
  app.post(
    "/gifts/:id/contribute",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        params: z.object({ id: z.string().uuid() }),
        body: CreateGroupContributeBodySchema,
        response: {
          201: GroupContributeResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as CreateGroupContributeBody;
      const order = await app.deps.repos.findGiftOrderById(id);
      if (!order) return reply.code(404).send({ error: "Not Found", message: "Gift order not found" });
      if (order.groupTargetMinor == null) {
        return reply.code(400).send({ error: "Bad Request", message: "Gift order is not a group gift" });
      }
      const contribution = await app.deps.repos.createGroupGiftContribution({
        giftOrderId: id,
        contributorUserId: userId,
        contributorName: body.contributorName ?? null,
        amountMinor: body.amountMinor,
        note: body.note ?? null,
      });
      const contributedMinor = await app.deps.repos.sumGroupGiftContributions(id);
      trackServerEvent("group_gift_contributed", {
        userId,
        giftOrderId: id,
        amountMinor: body.amountMinor,
        contributedMinor,
      });
      return reply.code(201).send({
        contribution: toContributionJson(contribution),
        gift: toGiftJson(order, contributedMinor),
      });
    },
  );

  // U049 — occasion deadline board + budget lock + T-7/T-2 reminder plan
  app.get(
    "/gifts/deadlines",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        response: {
          200: z.object({
            board: z.array(
              z.object({
                recipientId: z.string().uuid(),
                recipientName: z.string(),
                occasion: z.string(),
                label: z.string(),
                date: z.string().datetime(),
                daysUntil: z.number().int(),
                budgetLockMinor: z.number().int().nullable(),
                currency: z.string().nullable(),
                shortlistCount: z.number().int(),
                reminderLeads: z.array(z.number().int()),
              }),
            ),
            reminderLeads: z.array(z.number().int()),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const recipients = await app.deps.repos.listRecipients(userId);
      const rows: Array<{
        recipientId: string;
        recipientName: string;
        occasion: string;
        label?: string | null;
        date: string;
      }> = [];
      for (const r of recipients) {
        const profile = await app.deps.repos.findRecipientProfile(r.id);
        for (const d of profile?.importantDates ?? []) {
          rows.push({
            recipientId: r.id,
            recipientName: r.name,
            occasion: d.occasion,
            label: d.label,
            date: d.date,
          });
        }
      }
      return {
        board: buildGiftDeadlineBoard(rows),
        reminderLeads: [...GIFT_DEADLINE_LEAD_DAYS],
      };
    },
  );

  app.post(
    "/gifts/deadlines/lock",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gifts"],
        body: z.object({
          recipientId: z.string().uuid(),
          occasion: z.string().min(1),
          date: z.string().datetime(),
          budgetLockMinor: z.number().int().nonnegative(),
          currency: z.string().optional(),
          shortlistIds: z.array(z.string()).max(3).optional(),
        }),
        response: {
          200: z.object({
            lock: z.object({
              recipientId: z.string().uuid(),
              occasion: z.string(),
              date: z.string().datetime(),
              budgetLockMinor: z.number().int(),
              currency: z.string(),
              lockedAt: z.string().datetime(),
              shortlistIds: z.array(z.string()),
            }),
            reminders: z.array(
              z.object({
                leadDays: z.number().int(),
                jobId: z.string(),
                delayMs: z.number().nullable(),
              }),
            ),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body;
      const recipient = await app.deps.repos.findRecipient(body.recipientId, userId);
      if (!recipient) {
        return reply.code(404).send({ error: "Not Found", message: "Recipient not found" });
      }
      const short = lockShortlistOfThree(
        body.shortlistIds ?? [],
        body.budgetLockMinor,
      );
      const lock = setGiftBudgetLock({
        recipientId: body.recipientId,
        occasion: body.occasion,
        date: body.date,
        budgetLockMinor: short.budgetLockMinor,
        currency: body.currency,
        shortlistIds: short.shortlistIds,
      });
      const reminders = GIFT_DEADLINE_LEAD_DAYS.map((leadDays) => ({
        leadDays,
        jobId: giftDeadlineReminderJobId(
          body.recipientId,
          body.occasion,
          body.date,
          leadDays,
        ),
        delayMs: computeGiftDeadlineReminderDelayMs(body.date, leadDays),
      }));
      audit(app.log, "gift.budget.locked", {
        userId,
        recipientId: body.recipientId,
        budgetLockMinor: lock.budgetLockMinor,
        shortlistCount: lock.shortlistIds.length,
      });
      trackServerEvent("gift_budget_locked", {
        userId,
        recipientId: body.recipientId,
        budgetLockMinor: lock.budgetLockMinor,
      });
      return { lock, reminders };
    },
  );
};
