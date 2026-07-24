import {
  ApplyReferralBodySchema,
  ApplyReferralResponseSchema,
  ReferralCodeResponseSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const referralRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/referrals/me",
    {
      schema: {
        tags: ["referrals"],
        response: { 200: ReferralCodeResponseSchema, 401: ErrorSchema },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      let user = await app.deps.repos.findUserById(request.user.sub);
      if (user && !user.referralCode) {
        user = await app.deps.repos.updateUser(user.id, {
          referralCode: user.id.replace(/-/g, "").slice(0, 6).toUpperCase(),
        });
      }
      const referralCode = user?.referralCode ?? "PENDING";
      const referredCount = await app.deps.repos.countReferrals(request.user.sub);
      const earnedCoins = await app.deps.repos.countReferralCoinsEarned(request.user.sub);
      return {
        referralCode,
        referredCount,
        earnedCoins,
      };
    },
  );

  app.post(
    "/referrals/apply",
    {
      schema: {
        tags: ["referrals"],
        body: ApplyReferralBodySchema,
        response: {
          200: ApplyReferralResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const updated = await app.deps.repos.applyReferralCode(
        request.user.sub,
        request.body.referralCode.toUpperCase(),
      );
      if (!updated) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Invalid referral code or already referred",
        });
      }
      const referrer = await app.deps.repos.findUserById(updated.referredBy!);
      return {
        applied: true as const,
        referrerName: referrer?.displayName ?? null,
      };
    },
  );
};
