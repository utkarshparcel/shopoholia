import {
  CreateHouseholdBodySchema,
  HouseholdDetailResponseSchema,
  HouseholdInviteResponseSchema,
  HouseholdListResponseSchema,
  HouseholdSchema,
  HouseholdWardrobeResponseSchema,
  HouseholdVaultResponseSchema,
  HouseholdVaultSpendBodySchema,
  HouseholdVaultSpendResponseSchema,
  PatchHouseholdVaultMemberBodySchema,
  JoinHouseholdBodySchema,
  PatchHouseholdWardrobeBodySchema,
  WardrobeItemSchema,
  buildHouseholdInvitePayload,
  careRulesOrNull,
  checkHouseholdVaultSpendCap,
  denyUnlessCanAccessHouseholdWardrobe,
  denyUnlessHouseholdMember,
  denyUnlessHouseholdOwner,
  friendlyHouseholdVaultAclCopy,
  generateHouseholdInviteCode,
  householdMemberUserIds,
  normalizeHouseholdInviteCode,
  redactHouseholdVaultAccount,
  type CreateHouseholdBody,
  type JoinHouseholdBody,
  type PatchHouseholdWardrobeBody,
  type PatchHouseholdVaultMemberBody,
  type HouseholdVaultSpendBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import type {
  HouseholdMemberRecord,
  HouseholdRecord,
  WardrobeItemRecord,
} from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const HouseholdVaultMemberSettingsOut = z.object({
  userId: z.string().uuid(),
  vaultAccess: z.enum(["VIEW", "SPEND"]),
  spendCapMinor: z.number().int().nonnegative().nullable(),
  spentMinor: z.number().int().nonnegative(),
});

function toHouseholdJson(h: HouseholdRecord, memberCount?: number) {
  return {
    id: h.id,
    name: h.name,
    ownerId: h.ownerId,
    inviteCode: h.inviteCode,
    memberCount,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  };
}

function toMemberJson(m: HouseholdMemberRecord) {
  return {
    id: m.id,
    householdId: m.householdId,
    userId: m.userId,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
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

function authzMessage(reason: string): string {
  switch (reason) {
    case "NOT_MEMBER":
      return "Not a member of this household";
    case "NOT_OWNER":
      return "Only the household owner can do that";
    case "OUTSIDER":
      return "Item is not in this household";
    default:
      return "Forbidden";
  }
}

export const householdRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/households",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        body: CreateHouseholdBodySchema,
        response: { 201: HouseholdSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateHouseholdBody;
      let inviteCode = generateHouseholdInviteCode(8);
      for (let i = 0; i < 5; i++) {
        const clash = await app.deps.repos.findHouseholdByInviteCode(inviteCode);
        if (!clash) break;
        inviteCode = generateHouseholdInviteCode(8);
      }
      const household = await app.deps.repos.createHousehold({
        name: body.name.trim(),
        ownerId: userId,
        inviteCode,
      });
      await app.deps.repos.addHouseholdMember({
        householdId: household.id,
        userId,
        role: "OWNER",
      });
      trackServerEvent("household_created", { userId, householdId: household.id });
      return reply.code(201).send(toHouseholdJson(household, 1));
    },
  );

  app.get(
    "/households",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        response: { 200: HouseholdListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const list = await app.deps.repos.listHouseholdsForUser(userId);
      const households = await Promise.all(
        list.map(async (h) => {
          const members = await app.deps.repos.listHouseholdMembers(h.id);
          return toHouseholdJson(h, members.length);
        }),
      );
      return { households };
    },
  );

  app.post(
    "/households/join",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        body: JoinHouseholdBodySchema,
        response: {
          200: HouseholdDetailResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as JoinHouseholdBody;
      const code = normalizeHouseholdInviteCode(body.inviteCode);
      const household = await app.deps.repos.findHouseholdByInviteCode(code);
      if (!household) {
        return reply.code(404).send({ error: "Not Found", message: "Invite code not found" });
      }
      await app.deps.repos.addHouseholdMember({
        householdId: household.id,
        userId,
        role: "MEMBER",
      });
      const members = await app.deps.repos.listHouseholdMembers(household.id);
      const me = members.find((m) => m.userId === userId);
      trackServerEvent("household_joined", { userId, householdId: household.id });
      return {
        household: toHouseholdJson(household, members.length),
        members: members.map(toMemberJson),
        role: me?.role ?? "MEMBER",
      };
    },
  );

  app.get(
    "/households/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: HouseholdDetailResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const household = await app.deps.repos.findHouseholdById(id);
      if (!household) {
        return reply.code(404).send({ error: "Not Found", message: "Household not found" });
      }
      const members = await app.deps.repos.listHouseholdMembers(id);
      const denial = denyUnlessHouseholdMember(members, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      const me = members.find((m) => m.userId === userId)!;
      return {
        household: toHouseholdJson(household, members.length),
        members: members.map(toMemberJson),
        role: me.role,
      };
    },
  );

  app.get(
    "/households/:id/invite",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: HouseholdInviteResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const household = await app.deps.repos.findHouseholdById(id);
      if (!household) {
        return reply.code(404).send({ error: "Not Found", message: "Household not found" });
      }
      const members = await app.deps.repos.listHouseholdMembers(id);
      const denial = denyUnlessHouseholdMember(members, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      return buildHouseholdInvitePayload(household.inviteCode);
    },
  );

  /** Shared wardrobe ACL — all members' items; outsiders denied. */
  app.get(
    "/households/:id/wardrobe",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: HouseholdWardrobeResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const household = await app.deps.repos.findHouseholdById(id);
      if (!household) {
        return reply.code(404).send({ error: "Not Found", message: "Household not found" });
      }
      const members = await app.deps.repos.listHouseholdMembers(id);
      const denial = denyUnlessHouseholdMember(members, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      const memberIds = householdMemberUserIds(members);
      const all: WardrobeItemRecord[] = [];
      for (const mid of memberIds) {
        const items = await app.deps.repos.listWardrobeItems(mid);
        all.push(...items);
      }
      all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const withUrls = await Promise.all(
        all.map(async (r) => {
          const imageUrls = await Promise.all(
            (r.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
          );
          const garmentImageUrl = r.garmentImageKey
            ? await app.deps.storage.getSignedUrl(r.garmentImageKey)
            : null;
          return toWardrobeJson(r, imageUrls, garmentImageUrl);
        }),
      );
      return { householdId: id, items: withUrls };
    },
  );

  /** Partner may update laundry on shared inventory. */
  app.patch(
    "/households/:id/wardrobe/:itemId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        params: z.object({ id: z.string().uuid(), itemId: z.string().uuid() }),
        body: PatchHouseholdWardrobeBodySchema,
        response: {
          200: WardrobeItemSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id, itemId } = request.params;
      const body = request.body as PatchHouseholdWardrobeBody;
      const household = await app.deps.repos.findHouseholdById(id);
      if (!household) {
        return reply.code(404).send({ error: "Not Found", message: "Household not found" });
      }
      const members = await app.deps.repos.listHouseholdMembers(id);
      const item = await app.deps.repos.findWardrobeItemById(itemId);
      if (!item) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      const denial = denyUnlessCanAccessHouseholdWardrobe(members, item.userId, userId);
      if (denial) {
        return reply.code(403).send({ error: "Forbidden", message: authzMessage(denial) });
      }
      const updated = await app.deps.repos.updateWardrobeItemById(itemId, {
        laundryStatus: body.laundryStatus,
      });
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Wardrobe item not found" });
      }
      trackServerEvent("household_wardrobe_patched", {
        userId,
        householdId: id,
        itemId,
      });
      const imageUrls = await Promise.all(
        (updated.imageKeys ?? []).map((k) => app.deps.storage.getSignedUrl(k)),
      );
      const garmentImageUrl = updated.garmentImageKey
        ? await app.deps.storage.getSignedUrl(updated.garmentImageKey)
        : null;
      return toWardrobeJson(updated, imageUrls, garmentImageUrl);
    },
  );

  /** U015 — shared vault (redacted; no card numbers). View-only default. */
  app.get(
    "/households/:id/vault",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: HouseholdVaultResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const household = await app.deps.repos.findHouseholdById(id);
      if (!household) {
        return reply.code(404).send({ error: "Not Found", message: "Household not found" });
      }
      const members = await app.deps.repos.listHouseholdMembers(id);
      const denial = denyUnlessHouseholdMember(members, userId);
      if (denial) {
        return reply.code(403).send({
          error: "Forbidden",
          message: friendlyHouseholdVaultAclCopy(denial),
        });
      }
      const mySettings = await app.deps.repos.getHouseholdVaultSettings(id, userId);
      const memberIds = householdMemberUserIds(members);
      const accounts = [];
      for (const mid of memberIds) {
        const list = await app.deps.repos.listMoneyAccounts(mid);
        for (const a of list) {
          if (a.status && a.status !== "ACTIVE") continue;
          accounts.push(
            redactHouseholdVaultAccount({
              id: a.id,
              ownerUserId: a.userId,
              merchant: a.merchant,
              kind: a.kind,
              currency: a.currency,
              balanceCacheMinor: a.balanceCacheMinor,
              expiresAt: a.expiresAt,
            }),
          );
        }
      }
      const allSettings = await app.deps.repos.listHouseholdVaultSettings(id);
      const settingsByUser = new Map(allSettings.map((s) => [s.userId, s]));
      const memberSettings = members.map((m) => {
        const s = settingsByUser.get(m.userId);
        return {
          userId: m.userId,
          vaultAccess: (s?.vaultAccess ?? "VIEW") as "VIEW" | "SPEND",
          spendCapMinor: s?.spendCapMinor ?? null,
          spentMinor: s?.spentMinor ?? 0,
        };
      });
      return {
        householdId: id,
        myAccess: mySettings.vaultAccess,
        mySpendCapMinor: mySettings.spendCapMinor,
        mySpentMinor: mySettings.spentMinor,
        accounts,
        members: memberSettings,
      };
    },
  );

  /** Owner sets per-member vault access + spend cap. */
  app.patch(
    "/households/:id/vault/members",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        params: z.object({ id: z.string().uuid() }),
        body: PatchHouseholdVaultMemberBodySchema,
        response: {
          200: HouseholdVaultMemberSettingsOut,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const body = request.body as PatchHouseholdVaultMemberBody;
      const household = await app.deps.repos.findHouseholdById(id);
      if (!household) {
        return reply.code(404).send({ error: "Not Found", message: "Household not found" });
      }
      const members = await app.deps.repos.listHouseholdMembers(id);
      const denial = denyUnlessHouseholdOwner(members, userId);
      if (denial) {
        return reply.code(403).send({
          error: "Forbidden",
          message: friendlyHouseholdVaultAclCopy(denial),
        });
      }
      if (!members.some((m) => m.userId === body.userId)) {
        return reply.code(404).send({ error: "Not Found", message: "Member not found" });
      }
      const updated = await app.deps.repos.upsertHouseholdVaultSettings({
        householdId: id,
        userId: body.userId,
        vaultAccess: body.vaultAccess,
        spendCapMinor: body.spendCapMinor,
      });
      trackServerEvent("household_vault_member_patched", {
        userId,
        householdId: id,
        targetUserId: body.userId,
        vaultAccess: updated.vaultAccess,
      });
      return {
        userId: updated.userId,
        vaultAccess: updated.vaultAccess,
        spendCapMinor: updated.spendCapMinor,
        spentMinor: updated.spentMinor,
      };
    },
  );

  /** Mark-spent against a household member's credit — ACL + cap enforced. */
  app.post(
    "/households/:id/vault/spend",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["households"],
        params: z.object({ id: z.string().uuid() }),
        body: HouseholdVaultSpendBodySchema,
        response: {
          200: HouseholdVaultSpendResponseSchema,
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
      const body = request.body as HouseholdVaultSpendBody;
      const household = await app.deps.repos.findHouseholdById(id);
      if (!household) {
        return reply.code(404).send({ error: "Not Found", message: "Household not found" });
      }
      const members = await app.deps.repos.listHouseholdMembers(id);
      const denial = denyUnlessHouseholdMember(members, userId);
      if (denial) {
        return reply.code(403).send({
          error: "Forbidden",
          message: friendlyHouseholdVaultAclCopy(denial),
        });
      }
      const settings = await app.deps.repos.getHouseholdVaultSettings(id, userId);
      const capCheck = checkHouseholdVaultSpendCap({
        isMember: true,
        vaultAccess: settings.vaultAccess,
        spendCapMinor: settings.spendCapMinor,
        spentMinor: settings.spentMinor,
        amountMinor: body.amountMinor,
      });
      if (!capCheck.allowed) {
        return reply.code(403).send({
          error: "Forbidden",
          message: friendlyHouseholdVaultAclCopy(capCheck.reason),
        });
      }
      // Find account owned by any household member (no card secrets returned).
      let account = null as Awaited<
        ReturnType<typeof app.deps.repos.findMoneyAccount>
      >;
      let ownerId: string | null = null;
      for (const mid of householdMemberUserIds(members)) {
        const found = await app.deps.repos.findMoneyAccount(body.accountId, mid);
        if (found) {
          account = found;
          ownerId = mid;
          break;
        }
      }
      if (!account || !ownerId) {
        return reply.code(404).send({ error: "Not Found", message: "Credit not found in shared vault" });
      }
      try {
        await app.deps.repos.postMoneyLedger({
          accountId: account.id,
          userId: ownerId,
          delta: -body.amountMinor,
          type: "SPEND",
          refType: "household.vault.spend",
          refId: body.idempotencyKey,
        });
      } catch (err) {
        const raced = await app.deps.repos.findMoneyLedgerByRef(
          ownerId,
          body.idempotencyKey,
          "SPEND",
        );
        if (!raced) throw err;
      }
      const refreshed = await app.deps.repos.findMoneyAccount(account.id, ownerId);
      const nextSpent = settings.spentMinor + body.amountMinor;
      await app.deps.repos.upsertHouseholdVaultSettings({
        householdId: id,
        userId,
        spentMinor: nextSpent,
      });
      trackServerEvent("household_vault_spent", {
        userId,
        householdId: id,
        amountMinor: body.amountMinor,
      });
      return {
        balanceMinor: refreshed?.balanceCacheMinor ?? Math.max(0, account.balanceCacheMinor - body.amountMinor),
        spentMinor: nextSpent,
        remainingCapMinor:
          settings.spendCapMinor == null
            ? null
            : Math.max(0, settings.spendCapMinor - nextSpent),
      };
    },
  );
};


