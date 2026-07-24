import {
  StreakResponseSchema,
  StreakClaimResponseSchema,
  streakRewardForDay,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const streaksRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/streaks/me",
    {
      schema: {
        tags: ["streaks"],
        response: { 200: StreakResponseSchema, 401: ErrorSchema },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const status = await app.deps.repos.getStreakStatus(request.user.sub);
      const nextDay = status.todayClaimed
        ? status.streakCount + 1
        : status.streakCount + 1;
      return {
        currentStreak: status.streakCount,
        lastClaimedAt: status.lastClaimedAt?.toISOString() ?? null,
        todayClaimed: status.todayClaimed,
        nextRewardCoins: streakRewardForDay(nextDay),
        nextRewardDay: nextDay,
      };
    },
  );

  app.post(
    "/streaks/claim",
    {
      schema: {
        tags: ["streaks"],
        response: { 200: StreakClaimResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const result = await app.deps.repos.claimStreak(request.user.sub);
      if (result.coinsGranted === 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Already claimed today. Come back tomorrow!",
        });
      }
      return {
        claimed: true as const,
        coinsGranted: result.coinsGranted,
        currentStreak: result.streakCount,
        balanceAfter: result.balanceAfter,
      };
    },
  );
};
