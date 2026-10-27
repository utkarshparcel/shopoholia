import {
  buildAskFriendShare,
  buildReturnPollShare,
  tallyAskFriendVotes,
  tallyReturnVotes,
  type AskFriendOption,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";
import { toDateKey } from "../lib/outfit-week.js";
import {
  askFriendWinnerForCalendar,
  socialPollStore,
  type AskFriendPollRecord,
  type ReturnPollRecord,
} from "../lib/social-poll-store.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

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

function toReturnPublic(poll: ReturnPollRecord, now = new Date()) {
  const expired = now.getTime() >= poll.expiresAt.getTime();
  const share = buildReturnPollShare({
    pollId: poll.id,
    itemLabel: poll.itemLabel,
  });
  return {
    id: poll.id,
    kind: "return" as const,
    itemLabel: poll.itemLabel,
    expiresAt: poll.expiresAt.toISOString(),
    expired,
    tally: tallyReturnVotes(poll.votes),
    shareText: share.shareText,
    deepLink: share.deepLink,
  };
}

function toAskFriendPublic(poll: AskFriendPollRecord, now = new Date()) {
  const expired = now.getTime() >= poll.expiresAt.getTime();
  const share = buildAskFriendShare({
    pollId: poll.id,
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
    tally: tallyAskFriendVotes(poll.options, poll.votes),
    winnerAppliedAt: poll.winnerAppliedAt?.toISOString() ?? null,
    shareText: share.shareText,
    deepLink: share.deepLink,
  };
}

export const socialPollRoutes: FastifyPluginAsyncZod = async (app) => {
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
      const poll = socialPollStore.createReturnPoll({
        userId,
        itemLabel: body.itemLabel,
        returnRequestId: body.returnRequestId,
        ttlMs: body.ttlMs,
      });
      trackServerEvent("return_poll_created", {
        userId,
        pollId: poll.id,
      });
      return reply.code(201).send(toReturnPublic(poll));
    },
  );

  app.get(
    "/polls/return/:id",
    {
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: ReturnPollPublicSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const poll = socialPollStore.get(request.params.id);
      if (!poll || poll.kind !== "return") {
        return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      }
      return toReturnPublic(poll);
    },
  );

  app.post(
    "/polls/return/:id/vote",
    {
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          choice: z.enum(["KEEP", "RETURN"]),
          voterKey: z.string().min(1).max(64).optional(),
        }),
        response: {
          200: ReturnPollPublicSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { choice: "KEEP" | "RETURN"; voterKey?: string };
      const result = socialPollStore.voteReturn(
        request.params.id,
        body.choice,
        body.voterKey,
      );
      if ("error" in result) {
        if (result.error === "not_found") {
          return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
        }
        if (result.error === "expired") {
          return reply.code(410).send({ error: "Gone", message: "Poll expired" });
        }
        return reply.code(400).send({
          error: "Bad Request",
          message: result.error === "already_voted" ? "Already voted" : result.error,
        });
      }
      trackServerEvent("return_poll_voted", {
        pollId: result.poll.id,
        choice: body.choice,
      });
      return toReturnPublic(result.poll);
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
        poll = socialPollStore.createAskFriendPoll({
          userId,
          options,
          plannedFor: body.plannedFor ?? toDateKey(new Date()),
          ttlMs: body.ttlMs,
        });
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
      return reply.code(201).send(toAskFriendPublic(poll));
    },
  );

  app.get(
    "/polls/outfit/:id",
    {
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: AskFriendPollPublicSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const poll = socialPollStore.get(request.params.id);
      if (!poll || poll.kind !== "outfit") {
        return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      }
      return toAskFriendPublic(poll);
    },
  );

  app.post(
    "/polls/outfit/:id/vote",
    {
      schema: {
        tags: ["social"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          optionId: z.string().min(1).max(64),
          voterKey: z.string().min(1).max(64).optional(),
        }),
        response: {
          200: AskFriendPollPublicSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          410: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { optionId: string; voterKey?: string };
      const result = socialPollStore.voteAskFriend(
        request.params.id,
        body.optionId,
        body.voterKey,
      );
      if ("error" in result) {
        if (result.error === "not_found") {
          return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
        }
        if (result.error === "expired") {
          return reply.code(410).send({ error: "Gone", message: "Poll expired" });
        }
        return reply.code(400).send({
          error: "Bad Request",
          message:
            result.error === "already_voted"
              ? "Already voted"
              : result.error === "bad_option"
                ? "Unknown option"
                : result.error,
        });
      }
      trackServerEvent("ask_friend_voted", {
        pollId: result.poll.id,
        optionId: body.optionId,
      });
      return toAskFriendPublic(result.poll);
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
      const poll = socialPollStore.get(request.params.id);
      if (!poll || poll.kind !== "outfit") {
        return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      }
      if (poll.userId !== userId) {
        return reply.code(404).send({ error: "Not Found", message: "Poll not found" });
      }
      const winner = askFriendWinnerForCalendar(poll);
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
        toDateKey(new Date());
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
      socialPollStore.markWinnerApplied(poll.id);
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
        poll: toAskFriendPublic(poll),
      };
    },
  );
};
