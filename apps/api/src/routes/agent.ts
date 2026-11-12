import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { RenderScenarioSchema } from "@worn/shared";
import { secretsEqual } from "../lib/auth/admin.js";
import { completeAgentJob, failAgentJob, leaseJobsForAgent } from "../lib/render/agent-jobs.js";

/**
 * The render agent's API (docs/RENDER_AGENT.md). The agent, on the owner's Mac, only ever calls
 * out: it leases jobs, moves images through signed R2 URLs, and reports back. It authenticates
 * with RENDER_AGENT_TOKEN as a bearer token, never a user's JWT, and sees no user data.
 */

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const AgentIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,64}$/)
  .default("render-agent");

const JobParamsSchema = z.object({ id: z.uuid() });

const AgentJobSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["render", "tryon"]),
  scenario: RenderScenarioSchema.nullable(),
  attempt: z.number().int(),
  leaseExpiresAt: z.string(),
  modelImageUrl: z.string(),
  garmentImageUrls: z.array(z.string()),
  output: z.object({ url: z.string(), method: z.literal("PUT"), contentType: z.string() }),
});

/** An agent polls every 30 s and reports each job; this leaves plenty of room for a few agents. */
const AGENT_RATE_LIMIT = { max: process.env.NODE_ENV === "test" ? 1000 : 240, timeWindow: "1 minute" };

export const agentRoutes: FastifyPluginAsyncZod = async (app) => {
  const requireAgentToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const expected = app.deps.renderConfig.agentToken;
    const header = request.headers.authorization;
    const provided = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
    // Fail closed: with no RENDER_AGENT_TOKEN set, nobody is the agent.
    if (!expected || !provided || !secretsEqual(provided, expected)) {
      return reply.code(401).send({ error: "Unauthorized", message: "Invalid or missing render agent token" });
    }
  };

  const jobDeps = () => ({
    repos: app.deps.repos,
    storage: app.deps.storage,
    push: app.deps.push,
    config: app.deps.renderConfig,
  });

  app.post(
    "/agent/renders/lease",
    {
      preHandler: requireAgentToken,
      config: { rateLimit: AGENT_RATE_LIMIT },
      schema: {
        tags: ["agent"],
        body: z.object({ max: z.number().int().min(1).max(10).default(1), agentId: AgentIdSchema }),
        response: { 200: z.object({ jobs: z.array(AgentJobSchema) }), 401: ErrorSchema },
      },
    },
    async (request) => {
      const jobs = await leaseJobsForAgent(jobDeps(), { agentId: request.body.agentId, max: request.body.max });
      return { jobs };
    },
  );

  app.post(
    "/agent/renders/:id/complete",
    {
      preHandler: requireAgentToken,
      config: { rateLimit: AGENT_RATE_LIMIT },
      schema: {
        tags: ["agent"],
        params: JobParamsSchema,
        body: z.object({ agentId: AgentIdSchema }).default({ agentId: "render-agent" }),
        response: {
          200: z.object({ status: z.literal("DONE") }),
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const outcome = await completeAgentJob(jobDeps(), { id: request.params.id, agentId: request.body.agentId });
      if (outcome === "not_found") return reply.code(404).send({ error: "Not Found", message: "No such job" });
      if (outcome === "output_missing") {
        return reply.code(409).send({ error: "output_missing", message: "The output image was not uploaded" });
      }
      if (outcome === "not_leased") {
        return reply.code(409).send({ error: "not_leased", message: "This agent does not hold the job's lease" });
      }
      return { status: "DONE" as const };
    },
  );

  app.post(
    "/agent/renders/:id/fail",
    {
      preHandler: requireAgentToken,
      config: { rateLimit: AGENT_RATE_LIMIT },
      schema: {
        tags: ["agent"],
        params: JobParamsSchema,
        body: z.object({
          retryable: z.boolean(),
          reason: z.string().max(500).default(""),
          agentId: AgentIdSchema,
        }),
        response: {
          200: z.object({ status: z.enum(["QUEUED", "FAILED"]) }),
          401: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const outcome = await failAgentJob(jobDeps(), { id: request.params.id, ...request.body });
      if (outcome.status === "not_found") return reply.code(404).send({ error: "Not Found", message: "No such job" });
      if (outcome.status === "not_leased") {
        return reply.code(409).send({ error: "not_leased", message: "This agent does not hold the job's lease" });
      }
      request.log.info({ jobId: request.params.id, outcome: outcome.status }, "render_agent_job_failed");
      return { status: outcome.status === "requeued" ? ("QUEUED" as const) : ("FAILED" as const) };
    },
  );

  app.post(
    "/agent/heartbeat",
    {
      preHandler: requireAgentToken,
      config: { rateLimit: AGENT_RATE_LIMIT },
      schema: {
        tags: ["agent"],
        body: z.object({ agentId: AgentIdSchema, version: z.string().min(1).max(64) }),
        response: {
          200: z.object({ ok: z.literal(true), serverTime: z.string(), backend: z.string() }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      await app.deps.repos.recordAgentHeartbeat({
        agentId: request.body.agentId,
        version: request.body.version,
        at: new Date(),
      });
      return { ok: true as const, serverTime: new Date().toISOString(), backend: app.deps.renderConfig.backend };
    },
  );
};
