import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import Fastify, { type FastifyError, type FastifyRequest } from "fastify";
import { z } from "zod";
import { agentSweep, createDefaultDeps, type AppDeps } from "./lib/deps.js";
import { initServerAnalyticsFromEnv } from "./lib/analytics.js";
import { isUniqueViolation, reportRequestError } from "./lib/error-reporting.js";
import { resumeInFlightWork } from "./lib/jobs/resume.js";
import { resolveEconomyMode } from "./lib/orders/state-machine.js";
import { closeQueues } from "./lib/queues/enqueue.js";
import pino from "pino";
import { redactQueryError } from "./lib/redact-error.js";
import { captureException, initSentry } from "./lib/sentry.js";
import { installZod3Messages } from "./lib/zod-messages.js";
import {
  bootConfigProblems,
  fastifyTrustProxy,
  resolveCorsOrigin,
  resolveJwtSecret,
  resolveListenAddress,
  resolveTrustProxy,
} from "./lib/server-env.js";
import { depsPlugin } from "./plugins/deps.js";
import { responseEncodingPlugin } from "./plugins/response-encoding.js";
import { apiRoutes } from "./routes/index.js";

// Validation 400s keep the wording clients got before the zod 4 upgrade.
installZod3Messages();

const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

/** Route groups with tighter rate limits (money, vault data, sign-in). */
const RATE_LIMITED_GROUPS = ["/auth/", "/vault/consent", "/credits", "/accountant", "/ingestion", "/receipts"];

/**
 * What the request log keeps of a request: never its query string, which can carry an OAuth
 * code and state (the Gmail callback), tokens or personal data.
 */
export function requestLogFields(request: {
  method: string;
  url: string;
  host?: string;
  ip?: string;
  socket?: { remotePort?: number };
}) {
  return {
    method: request.method,
    url: request.url.split("?")[0],
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}

/** The request log's serializers: requests without query strings, errors without query values. */
export const logSerializers = {
  req: requestLogFields,
  err: (error: unknown) => pino.stdSerializers.err(redactQueryError(error as Error)),
};

export type BuildServerOptions = {
  deps?: Partial<AppDeps>;
  logger?: boolean;
};

export async function buildServer(options: BuildServerOptions = {}) {
  const boot = bootConfigProblems();
  const deps = await createDefaultDeps(options.deps);
  const app = Fastify({
    logger: (options.logger ?? process.env.NODE_ENV !== "test") ? { serializers: logSerializers } : false,
    // Behind the host's proxy the socket peer is the proxy: request.ip must come from
    // X-Forwarded-For, or every user shares one rate-limit bucket.
    trustProxy: fastifyTrustProxy(resolveTrustProxy()),
    // A slow client gets 2 minutes to send a request (10 MB uploads on a weak mobile link);
    // a socket idle for a minute is closed.
    requestTimeout: 120_000,
    connectionTimeout: 60_000,
    // Fastify's default, set explicitly because it is a security control: no JSON body may exceed
    // 1 MiB, which bounds what any schema validation has to walk. Uploads go through multipart,
    // whose own limits are below.
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Added before any plugin or route so it applies to all of them.
  app.addHook("onError", reportRequestError);
  app.addHook("onClose", async () => closeQueues());
  // A unique-constraint race the route didn't handle is a conflict, not a server error.
  // Everything else goes to Fastify's default handler (and the onError hook above).
  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (!isUniqueViolation(error)) {
      const status = typeof error.statusCode === "number" ? error.statusCode : 500;
      // In production a server error's message (SQL, ids, internals) stays in the log.
      if (status >= 500 && process.env.NODE_ENV === "production") {
        request.log.error({ err: error }, "request failed");
        // The onError hook only runs for errors sent as errors: report this one here.
        await reportRequestError(request, reply.code(status), error);
        return reply.send({
          error: "Internal Server Error",
          message: "Something went wrong. Please try again.",
        });
      }
      throw error;
    }
    request.log.warn({ err: error }, "unique constraint conflict");
    return reply.code(409).send({
      error: "Conflict",
      message: "This conflicts with a record that already exists",
    });
  });

  await app.register(cors, { origin: resolveCorsOrigin() });
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
  // Strict on purpose: fast-jwt accepted unsigned or empty-key tokens when a key was ''/null, and
  // an unpinned algorithm allows algorithm confusion. HS256 only, a non-empty secret, and every
  // token must carry an expiry (one signed without `exp` is refused, not treated as eternal).
  if (jwtSecret.secret.trim().length === 0) throw new Error("JWT secret must not be empty");
  await app.register(jwt, {
    secret: jwtSecret.secret,
    sign: { algorithm: "HS256" },
    verify: { algorithms: ["HS256"], requiredClaims: ["exp", "sub"] },
  });
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

/** How often the agent queue reclaims lapsed leases, hands jobs to overflow, and checks the agent. */
const AGENT_SWEEP_MS = 60_000;

/** RENDER_BACKEND=agent: sweep the agent's queue every minute (in the server only, not in tests). */
function startAgentSweeper(app: Awaited<ReturnType<typeof buildServer>>) {
  const sweep = agentSweep(app.deps.jobQueue);
  if (!sweep) return;
  const { backend, window, overflow } = app.deps.renderConfig;
  app.log.info(
    { backend, window: window.kind === "always" ? "always" : window, overflow },
    "Renders are made by the render agent",
  );
  const timer = setInterval(() => {
    sweep().catch((error: unknown) => {
      app.log.error(error, "Render agent sweep failed");
      captureException(error, { tags: { area: "render-agent" } });
    });
  }, AGENT_SWEEP_MS);
  timer.unref();
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
    app.log.info(`Delivery timers: ${resolveEconomyMode()} (WORN_ECONOMY_MODE)`);
    const resumed = await resumeInFlightWork(app.deps);
    app.log.info(resumed, "Resumed in-flight orders and renders");
    startAgentSweeper(app);
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

/** True when this file is the process's entry point (node dist/index.js, tsx src/index.ts). */
export function isEntryPoint(moduleUrl: string, argv1: string | undefined = process.argv[1]): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

// Importing buildServer (tests, scripts) must not start a second API with its timers.
if (process.env.NODE_ENV !== "test" && isEntryPoint(import.meta.url)) {
  void main();
}
