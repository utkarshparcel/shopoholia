import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";
import { createDefaultDeps, type AppDeps } from "./lib/deps.js";
import { initServerAnalyticsFromEnv } from "./lib/analytics.js";
import { isUniqueViolation, reportRequestError } from "./lib/error-reporting.js";
import { resumeInFlightWork } from "./lib/jobs/resume.js";
import { closeQueues } from "./lib/queues/enqueue.js";
import { captureException, initSentry } from "./lib/sentry.js";
import { bootConfigProblems, resolveJwtSecret, resolveListenAddress } from "./lib/server-env.js";
import { depsPlugin } from "./plugins/deps.js";
import { responseEncodingPlugin } from "./plugins/response-encoding.js";
import { apiRoutes } from "./routes/index.js";

const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

/** Route groups with tighter rate limits (money, vault data, sign-in). */
const RATE_LIMITED_GROUPS = ["/auth/", "/vault/consent", "/credits", "/accountant", "/ingestion", "/receipts"];

export type BuildServerOptions = {
  deps?: Partial<AppDeps>;
  logger?: boolean;
};

export async function buildServer(options: BuildServerOptions = {}) {
  const boot = bootConfigProblems();
  const deps = await createDefaultDeps(options.deps);
  const app = Fastify({
    logger: options.logger ?? process.env.NODE_ENV !== "test",
    // A slow client gets 2 minutes to send a request (10 MB uploads on a weak mobile link);
    // a socket idle for a minute is closed.
    requestTimeout: 120_000,
    connectionTimeout: 60_000,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Added before any plugin or route so it applies to all of them.
  app.addHook("onError", reportRequestError);
  app.addHook("onClose", async () => closeQueues());
  // A unique-constraint race the route didn't handle is a conflict, not a server error.
  // Everything else goes to Fastify's default handler (and the onError hook above).
  app.setErrorHandler(async (error, request, reply) => {
    if (!isUniqueViolation(error)) throw error;
    request.log.warn({ err: error }, "unique constraint conflict");
    return reply.code(409).send({
      error: "Conflict",
      message: "This conflicts with a record that already exists",
    });
  });

  await app.register(cors, {
    origin: process.env.NODE_ENV === "production"
      ? (process.env.CORS_ORIGIN ?? "https://shopoholia.app")
      : true,
  });
  await app.register(multipart, {
    // Uploads take one photo (avatar: a few); anything past these limits is a 413.
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 5,
      fields: 20,
      fieldSize: 64 * 1024,
      parts: 25,
      headerPairs: 100,
    },
  });
  const jwtSecret = resolveJwtSecret();
  if (jwtSecret.warning) app.log.warn(jwtSecret.warning);
  for (const warning of [...boot.errors, ...boot.warnings]) app.log.warn(`[config] ${warning}`);
  await app.register(jwt, { secret: jwtSecret.secret });
  // Each route group has its own bucket per signed-in user (per IP when signed out), so one screen
  // that calls several groups never trips another group's limit, and users behind one IP don't share.
  const rateLimitKey = (request: FastifyRequest): string => {
    const url = request.url.split("?")[0] ?? "";
    const group =
      url === "/vault" && request.method === "DELETE"
        ? "vault-delete"
        : (RATE_LIMITED_GROUPS.find((prefix) => url.startsWith(prefix)) ?? "default");
    const header = request.headers.authorization;
    let userId: string | null = null;
    // Sign-in is limited per IP; elsewhere a verified access token names the user.
    if (group !== "/auth/" && header?.startsWith("Bearer ")) {
      try {
        const sub = (app.jwt.verify(header.slice(7)) as { sub?: unknown }).sub;
        userId = typeof sub === "string" ? sub : null;
      } catch {
        userId = null;
      }
    }
    return `${group}|${userId ? `u:${userId}` : `ip:${request.ip}`}`;
  };
  await app.register(rateLimit, {
    global: true,
    // `key` is rateLimitKey's: "<group>|u:<user id>" or "<group>|ip:<ip>".
    max: (_request, key) => {
      if (process.env.NODE_ENV === "test") return 1000;
      const [group, who = ""] = key.split("|");
      const user = who.startsWith("u:");
      if (group === "vault-delete") return 5;
      if (group === "/auth/") return 20;
      if (group !== "default") return user ? 60 : 20;
      return 100;
    },
    timeWindow: "1 minute",
    skipOnError: true,
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
    keyGenerator: rateLimitKey,
  });
  await app.register(depsPlugin(deps));
  await app.register(responseEncodingPlugin);

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      status: "ok" as const,
      timestamp: new Date().toISOString(),
    }),
  );

  await app.register(apiRoutes);

  return app;
}

const { port, host } = resolveListenAddress();

async function main() {
  initSentry();
  initServerAnalyticsFromEnv();
  const { errors } = bootConfigProblems();
  if (errors.length > 0 && process.env.NODE_ENV === "production") {
    // Production never runs on a mock provider.
    console.error(`Refusing to start in production: ${errors.join("; ")}`);
    process.exit(1);
  }
  const app = await buildServer();

  try {
    const resumed = await resumeInFlightWork(app.deps);
    app.log.info(resumed, "Resumed in-flight orders and renders");
  } catch (error) {
    app.log.error(error, "Failed to resume in-flight orders and renders");
    captureException(error);
  }

  try {
    await app.listen({ port, host });
    app.log.info(`WORN API listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  void main();
}
