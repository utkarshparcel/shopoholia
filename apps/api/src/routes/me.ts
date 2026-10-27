import { TimeZoneResponseSchema, UpdateTimeZoneBodySchema, isValidTimeZone } from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  // Idempotent: the same body twice stores and returns the same name.
  app.put(
    "/me/time-zone",
    {
      schema: {
        tags: ["me"],
        body: UpdateTimeZoneBodySchema,
        response: {
          200: TimeZoneResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { timeZone } = request.body;
      if (!isValidTimeZone(timeZone)) {
        return reply
          .code(400)
          .send({ error: "invalid_time_zone", message: "timeZone must be an IANA time zone name" });
      }
      const stored = await app.deps.repos.setUserTimeZone(request.user.sub, timeZone);
      if (stored === null) {
        return reply.code(404).send({ error: "Not Found", message: "User not found" });
      }
      return { timeZone: stored };
    },
  );
};
