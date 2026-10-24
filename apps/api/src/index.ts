import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import Fastify from "fastify";
import { z } from "zod";
import { createDefaultDeps, type AppDeps } from "./lib/deps.js";
import { reportRequestError } from "./lib/error-reporting.js";
import { resumeInFlightWork } from "./lib/jobs/resume.js";
import { captureException, initSentry } from "./lib/sentry.js";
import { resolveJwtSecret, resolveListenAddress } from "./lib/server-env.js";
import { depsPlugin } from "./plugins/deps.js";
import { apiRoutes } from "./routes/index.js";

const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

export type BuildServerOptions = {
  deps?: Partial<AppDeps>;
  logger?: boolean;
};

export async function buildServer(options: BuildServerOptions = {}) {
  const deps = await createDefaultDeps(options.deps);
  const app = Fastify({
    logger: options.logger ?? process.env.NODE_ENV !== "test",
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Added before any plugin or route so it applies to all of them.
  app.addHook("onError", reportRequestError);

  await app.register(cors, {
    origin: process.env.NODE_ENV === "production"
      ? (process.env.CORS_ORIGIN ?? "https://shopoholia.app")
      : true,
  });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });
  const jwtSecret = resolveJwtSecret();
  if (jwtSecret.warning) app.log.warn(jwtSecret.warning);
  await app.register(jwt, { secret: jwtSecret.secret });
  await app.register(depsPlugin(deps));

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
