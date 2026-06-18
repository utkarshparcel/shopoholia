import {
  OtpRequestSchema,
  OtpResponseSchema,
  RefreshRequestSchema,
  TokenResponseSchema,
  VerifyRequestSchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { verifyAndLogin, refreshAccessToken } from "../lib/auth/tokens.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/auth/otp",
    {
      schema: {
        tags: ["auth"],
        body: OtpRequestSchema,
        response: { 200: OtpResponseSchema, 400: ErrorSchema },
      },
    },
    async (request) => {
      const { phone } = request.body;
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
