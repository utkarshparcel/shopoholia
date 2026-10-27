import {
  ApplyReferralBodySchema,
  ApplyReferralResponseSchema,
  AttributeReferralBodySchema,
  AttributeReferralResponseSchema,
  ReferralCodeResponseSchema,
  buildReferralDeepLink,
  buildReferralLandingCopy,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { trackServerEvent } from "../lib/analytics.js";

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

  /** N36 — attribution when family share deep link `worn.app/r/{code}` is opened. */
  app.post(
    "/referrals/attribute",
    {
      schema: {
        tags: ["referrals"],
        body: AttributeReferralBodySchema,
        response: {
          200: AttributeReferralResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const code = request.body.referralCode.toUpperCase();
      const referrer = await app.deps.repos.findUserByReferralCode(code);
      if (!referrer) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Unknown referral code",
        });
      }
      const deepLink = buildReferralDeepLink(code);
      trackServerEvent("referral_attribution", {
        referralCode: code,
        referrerId: referrer.id,
        source: request.body.source ?? "family_share",
      });
      return {
        attributed: true,
        referralCode: code,
        deepLink,
        landing: buildReferralLandingCopy(code),
      };
    },
  );

  /** Convenience GET for deep-link landers (same attribution as POST). */
  app.get(
    "/r/:code",
    {
      schema: {
        tags: ["referrals"],
        params: z.object({ code: z.string().min(4).max(20) }),
        response: {
          200: AttributeReferralResponseSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const code = request.params.code.toUpperCase();
      const referrer = await app.deps.repos.findUserByReferralCode(code);
      if (!referrer) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Unknown referral code",
        });
      }
      const deepLink = buildReferralDeepLink(code);
      trackServerEvent("referral_attribution", {
        referralCode: code,
        referrerId: referrer.id,
        source: "deep_link",
      });
      return {
        attributed: true,
        referralCode: code,
        deepLink,
        landing: buildReferralLandingCopy(code),
      };
    },
  );
};
