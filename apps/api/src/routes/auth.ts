import {
  GoogleAuthRequestSchema,
  OtpRequestSchema,
  OtpResponseSchema,
  RefreshRequestSchema,
  TokenResponseSchema,
  VerifyRequestSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { verifyGoogleIdToken } from "../lib/auth/google.js";
import { loginWithGoogleProfile, refreshAccessToken, verifyAndLogin } from "../lib/auth/tokens.js";
import { checkOtpRateLimit } from "../lib/rate-limit.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/auth/otp",
    {
      schema: {
        tags: ["auth"],
        body: OtpRequestSchema,
        response: { 200: OtpResponseSchema, 400: ErrorSchema, 429: ErrorSchema },
      },
    },
    async (request, reply) => {
      const { phone } = request.body;
      const rate = checkOtpRateLimit(phone);
      if (!rate.allowed) {
        return reply.code(429).send({
          error: "Too Many Requests",
          message: `Try again after ${new Date(rate.resetAt).toISOString()}`,
        });
      }
      return app.deps.otp.sendOtp(phone);
    },
  );

  app.post(
    "/auth/verify",
    {
      schema: {
        tags: ["auth"],
        body: VerifyRequestSchema,
        response: { 200: TokenResponseSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const { phone, otp } = request.body;
      const result = await verifyAndLogin(app, app.deps.repos, app.deps.otp, phone, otp);
      if (!result) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired OTP" });
      }
      return result;
    },
  );

  app.post(
    "/auth/google",
    {
      schema: {
        tags: ["auth"],
        body: GoogleAuthRequestSchema,
        response: {
          200: TokenResponseSchema,
          401: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const audiencesConfigured =
        Boolean(process.env.GOOGLE_CLIENT_IDS ?? process.env.GOOGLE_CLIENT_ID) ||
        process.env.NODE_ENV === "test";
      if (!audiencesConfigured) {
        return reply.code(503).send({
          error: "Service Unavailable",
          message: "Google Sign-In is not configured (set GOOGLE_CLIENT_IDS)",
        });
      }

      const profile = await verifyGoogleIdToken(request.body.idToken);
      if (!profile) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid Google ID token",
        });
      }

      return loginWithGoogleProfile(app, app.deps.repos, {
        googleSub: profile.sub,
        email: profile.email,
        displayName: profile.name,
      });
    },
  );

  app.post(
    "/auth/refresh",
    {
      schema: {
        tags: ["auth"],
        body: RefreshRequestSchema,
        response: { 200: TokenResponseSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const { refreshToken } = request.body;
      const result = await refreshAccessToken(app, app.deps.repos, refreshToken);
      if (!result) {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid refresh token" });
      }
      return result;
    },
  );
};
