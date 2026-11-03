import {
  AppleAuthRequestSchema,
  GoogleAuthRequestSchema,
  OtpRequestSchema,
  OtpResponseSchema,
  RefreshRequestSchema,
  TokenResponseSchema,
  VerifyRequestSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AppleVerifyUnavailableError,
  appleSignInAudiences,
  verifyAppleIdentityToken,
} from "../lib/auth/apple.js";
import { GoogleVerifyUnavailableError, verifyGoogleIdToken } from "../lib/auth/google.js";
import { OtpRateLimitError, OtpUnavailableError } from "../lib/auth/otp.js";
import {
  loginWithAppleProfile,
  loginWithGoogleProfile,
  refreshAccessToken,
  verifyAndLogin,
} from "../lib/auth/tokens.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/auth/otp",
    {
      schema: {
        tags: ["auth"],
        body: OtpRequestSchema,
        response: { 200: OtpResponseSchema, 400: ErrorSchema, 429: ErrorSchema, 503: ErrorSchema },
      },
    },
    async (request, reply) => {
      const { phone } = request.body;
      try {
        return await app.deps.otp.sendOtp(phone);
      } catch (error) {
        if (error instanceof OtpRateLimitError) {
          const retryAfterSeconds = Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1000));
          return reply
            .code(429)
            .header("retry-after", String(retryAfterSeconds))
            .send({ error: "Too Many Requests", message: error.message });
        }
        if (error instanceof OtpUnavailableError) {
          return reply.code(503).send({ error: "Service Unavailable", message: error.message });
        }
        throw error;
      }
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

      let profile: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
      try {
        profile = await verifyGoogleIdToken(request.body.idToken);
      } catch (error) {
        if (!(error instanceof GoogleVerifyUnavailableError)) throw error;
        request.log.warn({ err: error }, "google tokeninfo unavailable");
        return reply.code(503).send({
          error: "Service Unavailable",
          message: "Google Sign-In is unavailable right now. Try again in a moment.",
        });
      }
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

  /**
   * Sign in with Apple (iOS; App Store Guideline 4.8 because Google sign-in is offered). The
   * identity token is checked against Apple's keys, the app's bundle id and this sign-in's nonce.
   */
  app.post(
    "/auth/apple",
    {
      schema: {
        tags: ["auth"],
        body: AppleAuthRequestSchema,
        response: {
          200: TokenResponseSchema,
          401: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (appleSignInAudiences().length === 0 && process.env.NODE_ENV !== "test") {
        return reply.code(503).send({
          error: "Service Unavailable",
          message: "Sign in with Apple is not configured (set APPLE_BUNDLE_ID)",
        });
      }

      let identity: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
      try {
        identity = await verifyAppleIdentityToken(request.body.identityToken, request.body.nonce);
      } catch (error) {
        if (!(error instanceof AppleVerifyUnavailableError)) throw error;
        request.log.warn({ err: error }, "apple keys unavailable");
        return reply.code(503).send({
          error: "Service Unavailable",
          message: "Sign in with Apple is unavailable right now. Try again in a moment.",
        });
      }
      if (!identity) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid Apple identity token",
        });
      }

      return loginWithAppleProfile(app, app.deps.repos, {
        appleSub: identity.sub,
        email: identity.email,
        displayName: request.body.fullName ?? null,
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

  /**
   * Sign-out: the refresh token stops working, so a copy left on the device (or taken from it)
   * can't renew the session. No access token needed (it may have expired). Always 204, also for
   * a token that is unknown or already gone, so it can be retried.
   */
  app.post(
    "/auth/logout",
    {
      schema: {
        tags: ["auth"],
        body: RefreshRequestSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await app.deps.repos.deleteRefreshToken(request.body.refreshToken);
      return reply.code(204).send(null);
    },
  );
};
