import {
  ClearPushTokenBodySchema,
  PushTokenStatusResponseSchema,
  RegisterPushTokenBodySchema,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const pushRoutes: FastifyPluginAsyncZod = async (app) => {
  app.put(
    "/me/push-token",
    {
      schema: {
        tags: ["push"],
        body: RegisterPushTokenBodySchema,
        response: {
          200: PushTokenStatusResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const user = await app.deps.repos.setPushToken(request.user.sub, request.body.token);
      if (!user) {
        return reply.code(404).send({ error: "Not Found", message: "User not found" });
      }
      return { registered: true };
    },
  );

  app.delete(
    "/me/push-token",
    {
      schema: {
        tags: ["push"],
        body: ClearPushTokenBodySchema,
        response: { 200: PushTokenStatusResponseSchema, 400: ErrorSchema, 401: ErrorSchema },
      },
      preHandler: requireAuth,
    },
    async (request) => {
      await app.deps.repos.clearPushToken(request.user.sub, request.body?.token);
      return { registered: false };
    },
  );
};
