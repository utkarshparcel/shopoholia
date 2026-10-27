import {
  CashbackClaimListResponseSchema,
  CashbackClaimSchema,
  CreateCashbackClaimBodySchema,
  compareCashbackClaimsByDeadline,
  encodeCashbackClaimNotes,
  extractCashbackClaimUrl,
  stripCashbackClaimUrlFromNotes,
  cashbackClaimStartUrl,
  type CreateCashbackClaimBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { requireConsent } from "../lib/auth/consent.js";
import { trackServerEvent } from "../lib/analytics.js";
import { scheduleCashbackClaimReminder } from "../lib/cashback-claim-jobs.js";
import type { CashbackClaimRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function toClaimJson(c: CashbackClaimRecord) {
  const claimUrl = extractCashbackClaimUrl(c.notes);
  return {
    id: c.id,
    userId: c.userId,
    source: c.source,
    merchant: c.merchant,
    amountMinor: c.amountMinor,
    currency: c.currency,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    status: c.status,
    notes: stripCashbackClaimUrlFromNotes(c.notes),
    claimUrl,
    claimedAt: c.claimedAt ? c.claimedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export const cashbackClaimsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/cashback-claims",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["vault"],
        querystring: z.object({
          status: z.enum(["UNCLAIMED", "CLAIMED", "EXPIRED"]).optional(),
        }),
        response: { 200: CashbackClaimListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const { status } = request.query as { status?: CashbackClaimRecord["status"] };
      const claims = await app.deps.repos.listCashbackClaims(
        userId,
        status ? { status } : undefined,
      );
      const sorted = [...claims].sort(compareCashbackClaimsByDeadline);
      return { claims: sorted.map(toClaimJson) };
    },
  );

  app.post(
    "/cashback-claims",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["vault"],
        body: CreateCashbackClaimBodySchema,
        response: { 201: CashbackClaimSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateCashbackClaimBody;
      const created = await app.deps.repos.createCashbackClaim({
        userId,
        source: body.source,
        merchant: body.merchant,
        amountMinor: body.amountMinor,
        currency: body.currency,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        notes: encodeCashbackClaimNotes(body.notes, body.claimUrl),
      });
      await scheduleCashbackClaimReminder(created);
      trackServerEvent("cashback_claim_created", {
        userId,
        claimId: created.id,
        amountMinor: created.amountMinor,
      });
      return reply.code(201).send(toClaimJson(created));
    },
  );

  app.post(
    "/cashback-claims/:id/claim",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["vault"],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: CashbackClaimSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const claimed = await app.deps.repos.claimCashbackClaim(id, userId);
      if (!claimed) {
        return reply.code(404).send({ error: "Not Found", message: "Claim not found" });
      }
      trackServerEvent("cashback_claim_marked", {
        userId,
        claimId: id,
        status: claimed.status,
      });
      return toClaimJson(claimed);
    },
  );

  /** U006 — resolve claim-start URL for one-tap portal open (does not mark claimed). */
  app.get(
    "/cashback-claims/:id/start-url",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["vault"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            claimId: z.string().uuid(),
            startUrl: z.string().url().nullable(),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const claim = await app.deps.repos.findCashbackClaim(id, userId);
      if (!claim) {
        return reply.code(404).send({ error: "Not Found", message: "Claim not found" });
      }
      const startUrl = cashbackClaimStartUrl(
        claim.source,
        extractCashbackClaimUrl(claim.notes),
      );
      trackServerEvent("cashback_claim_start", {
        userId,
        claimId: id,
        hasUrl: Boolean(startUrl),
      });
      return { claimId: id, startUrl };
    },
  );
};
