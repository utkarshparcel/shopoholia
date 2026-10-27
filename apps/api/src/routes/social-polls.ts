import {
  buildAskFriendShare,
  buildReturnPollShare,
  localDateKey,
  resolveTimeZone,
  type AskFriendOption,
} from "@worn/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { assertPrivacySecretConfigured, pollShareToken } from "../lib/privacy-hmac.js";
import {
  askFriendWinnerForCalendar,
  createSocialPollStore,
  tallyAskFriendCounts,
  tallyReturnCounts,
  type AskFriendPollRecord,
  type ReturnPollRecord,
  type VoteResult,
} from "../lib/social-poll-store.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const ReturnTallySchema = z.object({
  keep: z.number().int(),
  return: z.number().int(),
  total: z.number().int(),
  winner: z.enum(["KEEP", "RETURN"]).nullable(),
});

const AskFriendTallySchema = z.object({
  counts: z.record(z.string(), z.number().int()),
  total: z.number().int(),
  winnerId: z.string().nullable(),
});

const ReturnPollPublicSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("return"),
  itemLabel: z.string(),
  expiresAt: z.string(),
  expired: z.boolean(),
  tally: z.object({
    keep: z.number().int(),
    return: z.number().int(),
    total: z.number().int(),
    winner: z.enum(["KEEP", "RETURN"]).nullable(),
  }),
  shareText: z.string(),
  deepLink: z.string(),
});

const AskFriendPollPublicSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("outfit"),
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      itemIds: z.array(z.string()),
      occasion: z.string().nullable().optional(),
    }),
  ),
  expiresAt: z.string(),
  expired: z.boolean(),
  plannedFor: z.string().nullable(),
  tally: z.object({
    counts: z.record(z.string(), z.number().int()),
    total: z.number().int(),
    winnerId: z.string().nullable(),
  }),
  winnerAppliedAt: z.string().nullable(),
  shareText: z.string(),
  deepLink: z.string(),
});

// Owner views (by id, auth + ownership). The share link carries the token, never the poll id.
function toReturnPublic(poll: ReturnPollRecord, counts: Record<string, number>, now = new Date()) {
  const expired = now.getTime() >= poll.expiresAt.getTime();
  const share = buildReturnPollShare({
    pollId: poll.id,
    shareToken: pollShareToken(poll.id),
    itemLabel: poll.itemLabel,
  });
  return {
    id: poll.id,
    kind: "return" as const,
    itemLabel: poll.itemLabel,
    expiresAt: poll.expiresAt.toISOString(),
    expired,
    tally: tallyReturnCounts(counts),
    shareText: share.shareText,
    deepLink: share.deepLink,
  };
}

function toAskFriendPublic(poll: AskFriendPollRecord, counts: Record<string, number>, now = new Date()) {
  const expired = now.getTime() >= poll.expiresAt.getTime();
  const share = buildAskFriendShare({
    pollId: poll.id,
    shareToken: pollShareToken(poll.id),
    options: poll.options,
  });
  return {
    id: poll.id,
    kind: "outfit" as const,
    options: poll.options.map((o) => ({
      id: o.id,
      label: o.label,
      itemIds: o.itemIds,
      occasion: o.occasion ?? null,
    })),
    expiresAt: poll.expiresAt.toISOString(),
    expired,
    plannedFor: poll.plannedFor,
    tally: tallyAskFriendCounts(poll.options, counts),
    winnerAppliedAt: poll.winnerAppliedAt?.toISOString() ?? null,
    shareText: share.shareText,
    deepLink: share.deepLink,
  };
}

// Friend views (by share token, no auth): the poll only, never poll, user or item ids.
const ShareTokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const VoterKeySchema = z.string().min(1).max(64).optional();

const ReturnPollFriendSchema = z.object({
  kind: z.literal("return"),
  itemLabel: z.string(),
  expiresAt: z.string(),
  expired: z.boolean(),
  tally: ReturnTallySchema,
});

const AskFriendPollFriendSchema = z.object({
  kind: z.literal("outfit"),
  options: z.array(
    z.object({ id: z.string(), label: z.string(), occasion: z.string().nullable() }),
  ),
  expiresAt: z.string(),
  expired: z.boolean(),
  tally: AskFriendTallySchema,
});

function toReturnFriend(poll: ReturnPollRecord, counts: Record<string, number>, now = new Date()) {
  return {
    kind: "return" as const,
    itemLabel: poll.itemLabel,
    expiresAt: poll.expiresAt.toISOString(),
    expired: now.getTime() >= poll.expiresAt.getTime(),
    tally: tallyReturnCounts(counts),
  };
}

function toAskFriendFriend(poll: AskFriendPollRecord, counts: Record<string, number>, now = new Date()) {
  return {
    kind: "outfit" as const,
    options: poll.options.map((o) => ({ id: o.id, label: o.label, occasion: o.occasion ?? null })),
    expiresAt: poll.expiresAt.toISOString(),
    expired: now.getTime() >= poll.expiresAt.getTime(),
    tally: tallyAskFriendCounts(poll.options, counts),
  };
}

/** One vote per voter: the voter's device key, else their IP (stored only as an HMAC). */
function voterKeyFor(request: FastifyRequest, voterKey: string | undefined): string {
  return voterKey ? `k:${voterKey}` : `ip:${request.ip}`;
}

function voteError(result: Extract<VoteResult<never>, { error: string }>) {
  if (result.error === "not_found") {
    return { code: 404 as const, body: { error: "Not Found", message: "Poll not found" } };
  }
  if (result.error === "expired") {
    return { code: 410 as const, body: { error: "Gone", message: "Poll expired" } };
  }
  return {
    code: 400 as const,
    body: {
      error: "Bad Request",
      message: result.error === "already_voted" ? "Already voted" : "Unknown option",
    },
  };
}

async function userToday(app: FastifyInstance, userId: string): Promise<string> {
  const user = await app.deps.repos.findUserById(userId);
  return localDateKey(new Date(), resolveTimeZone(user?.timeZone));
}

export const socialPollRoutes: FastifyPluginAsyncZod = async (app) => {
  assertPrivacySecretConfigured();
  const polls = createSocialPollStore(app.deps.repos);

  // --- N35 return poll ---
  app.post(
    "/polls/return",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["social"],
        body: z.object({
          itemLabel: z.string().min(1).max(120),
          returnRequestId: z.string().uuid().optional(),
          ttlMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1000).optional(),
        }),
        response: {
          201: ReturnPollPublicSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as {
        itemLabel: string;
        returnRequestId?: string;
        ttlMs?: number;
      };
      const { poll } = await polls.createReturnPoll({
        userId,
        itemLabel: body.itemLabel,
        returnRequestId: body.returnRequestId,
        ttlMs: body.ttlMs,
      });
      trackServerEvent("return_poll_created", {
        userId,
        pollId: poll.id,
      });
      return reply.code(201).send(toReturnPublic(poll, {}));
    },
  );

  app.get(
    "/polls/return/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: ReturnPollPublicSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const found = await polls.getOwned(request.params.id, request.user!.sub, "return");
      if (!found) {
        return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      }
      return toReturnPublic(found.poll, found.counts);
    },
  );

  app.post(
    "/polls/return/:id/vote",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          choice: z.enum(["KEEP", "RETURN"]),
          voterKey: VoterKeySchema,
        }),
        response: {
          200: ReturnPollPublicSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { choice: "KEEP" | "RETURN"; voterKey?: string };
      const found = await polls.getOwned(request.params.id, request.user!.sub, "return");
      const result = await polls.voteReturn(found?.poll ?? null, body.choice, voterKeyFor(request, body.voterKey));
      if ("error" in result) {
        const err = voteError(result);
        return reply.code(err.code).send(err.body);
      }
      if (result.inserted) {
        trackServerEvent("return_poll_voted", { pollId: result.poll.id, choice: body.choice });
      }
      return toReturnPublic(result.poll, result.counts);
    },
  );

  app.get(
    "/polls/public/return/:token",
    {
      schema: {
        tags: ["social"],
        params: ShareTokenParams,
        response: { 200: ReturnPollFriendSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const found = await polls.getByToken(request.params.token, "return");
      if (!found) return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      return toReturnFriend(found.poll, found.counts);
    },
  );

  app.post(
    "/polls/public/return/:token/vote",
    {
      config: { rateLimit: { max: process.env.NODE_ENV === "test" ? 1000 : 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["social"],
        params: ShareTokenParams,
        body: z.object({ choice: z.enum(["KEEP", "RETURN"]), voterKey: VoterKeySchema }),
        response: {
          200: ReturnPollFriendSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { choice: "KEEP" | "RETURN"; voterKey?: string };
      const found = await polls.getByToken(request.params.token, "return");
      const result = await polls.voteReturn(found?.poll ?? null, body.choice, voterKeyFor(request, body.voterKey));
      if ("error" in result) {
        const err = voteError(result);
        return reply.code(err.code).send(err.body);
      }
      if (result.inserted) {
        trackServerEvent("return_poll_voted", { pollId: result.poll.id, choice: body.choice });
      }
      return toReturnFriend(result.poll, result.counts);
    },
  );

  // --- N38 ask-a-friend ---
  app.post(
    "/polls/outfit",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["social"],
        body: z.object({
          options: z
            .array(
              z.object({
                id: z.string().min(1).max(64).optional(),
                label: z.string().min(1).max(120),
                itemIds: z.array(z.string().uuid()).min(1).max(12),
                occasion: z.string().max(40).nullable().optional(),
              }),
            )
            .min(2)
            .max(3),
          plannedFor: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          ttlMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1000).optional(),
        }),
        response: {
          201: AskFriendPollPublicSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as {
        options: Array<{
          id?: string;
          label: string;
          itemIds: string[];
          occasion?: string | null;
        }>;
        plannedFor?: string;
        ttlMs?: number;
      };
      const options: AskFriendOption[] = body.options.map((o, i) => ({
        id: o.id ?? `opt-${i + 1}`,
        label: o.label,
        itemIds: o.itemIds,
        occasion: o.occasion ?? null,
      }));
      let poll: AskFriendPollRecord;
      try {
        ({ poll } = await polls.createAskFriendPoll({
          userId,
          options,
          plannedFor: body.plannedFor ?? (await userToday(app, userId)),
          ttlMs: body.ttlMs,
        }));
      } catch (e) {
        return reply.code(400).send({
          error: "Bad Request",
          message: e instanceof Error ? e.message : "Invalid poll",
        });
      }
      trackServerEvent("ask_friend_poll_created", {
        userId,
        pollId: poll.id,
        optionCount: poll.options.length,
      });
      return reply.code(201).send(toAskFriendPublic(poll, {}));
    },
  );

  app.get(
    "/polls/outfit/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: AskFriendPollPublicSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const found = await polls.getOwned(request.params.id, request.user!.sub, "outfit");
      if (!found) {
        return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      }
      return toAskFriendPublic(found.poll, found.counts);
    },
  );

  app.post(
    "/polls/outfit/:id/vote",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          optionId: z.string().min(1).max(64),
          voterKey: VoterKeySchema,
        }),
        response: {
          200: AskFriendPollPublicSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { optionId: string; voterKey?: string };
      const found = await polls.getOwned(request.params.id, request.user!.sub, "outfit");
      const result = await polls.voteAskFriend(found?.poll ?? null, body.optionId, voterKeyFor(request, body.voterKey));
      if ("error" in result) {
        const err = voteError(result);
        return reply.code(err.code).send(err.body);
      }
      if (result.inserted) {
        trackServerEvent("ask_friend_voted", { pollId: result.poll.id, optionId: body.optionId });
      }
      return toAskFriendPublic(result.poll, result.counts);
    },
  );

  app.get(
    "/polls/public/outfit/:token",
    {
      schema: {
        tags: ["social"],
        params: ShareTokenParams,
        response: { 200: AskFriendPollFriendSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const found = await polls.getByToken(request.params.token, "outfit");
      if (!found) return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      return toAskFriendFriend(found.poll, found.counts);
    },
  );

  app.post(
    "/polls/public/outfit/:token/vote",
    {
      config: { rateLimit: { max: process.env.NODE_ENV === "test" ? 1000 : 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["social"],
        params: ShareTokenParams,
        body: z.object({ optionId: z.string().min(1).max(64), voterKey: VoterKeySchema }),
        response: {
          200: AskFriendPollFriendSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { optionId: string; voterKey?: string };
      const found = await polls.getByToken(request.params.token, "outfit");
      const result = await polls.voteAskFriend(found?.poll ?? null, body.optionId, voterKeyFor(request, body.voterKey));
      if ("error" in result) {
        const err = voteError(result);
        return reply.code(err.code).send(err.body);
      }
      if (result.inserted) {
        trackServerEvent("ask_friend_voted", { pollId: result.poll.id, optionId: body.optionId });
      }
      return toAskFriendFriend(result.poll, result.counts);
    },
  );

  /** Commit winning outfit into week calendar (N38 winner → calendar). */
  app.post(
    "/polls/outfit/:id/apply-winner",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            plannedFor: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
          })
          .optional(),
        response: {
          200: z.object({
            applied: z.literal(true),
            plannedFor: z.string(),
            outfitId: z.string().uuid(),
            winnerId: z.string(),
            poll: AskFriendPollPublicSchema,
          }),
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const found = await polls.getOwned(request.params.id, userId, "outfit");
      if (!found) {
        return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      }
      const { poll, counts } = found;
      const winner = askFriendWinnerForCalendar(poll, counts);
      if (!winner) {
        const expired = new Date().getTime() >= poll.expiresAt.getTime();
        return reply
          .code(expired ? 410 : 400)
          .send({
            error: expired ? "Gone" : "Bad Request",
            message: expired ? "Poll expired" : "No clear winner yet",
          });
      }
      const plannedFor =
        (request.body as { plannedFor?: string } | undefined)?.plannedFor ??
        poll.plannedFor ??
        (await userToday(app, userId));
      const outfit = await app.deps.repos.upsertOutfitForDate({
        userId,
        plannedFor,
        itemIds: winner.itemIds,
        occasion: (winner.occasion as
          | "CASUAL"
          | "WORK"
          | "FORMAL"
          | "PARTY"
          | "SPORT"
          | "TRAVEL"
          | null
          | undefined) ?? null,
        weatherCtx: {
          source: "ask_friend",
          pollId: poll.id,
          winnerId: winner.id,
        },
      });
      await polls.markWinnerApplied(poll.id);
      const applied = (await polls.getOwned(poll.id, userId, "outfit")) ?? found;
      trackServerEvent("ask_friend_winner_applied", {
        userId,
        pollId: poll.id,
        outfitId: outfit.id,
        plannedFor,
        winnerId: winner.id,
      });
      return {
        applied: true as const,
        plannedFor,
        outfitId: outfit.id,
        winnerId: winner.id,
        poll: toAskFriendPublic(applied.poll, applied.counts),
      };
    },
  );
};
