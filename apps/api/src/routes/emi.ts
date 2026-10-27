import {
  CreateEmiPlanBodySchema,
  EmiPlanListResponseSchema,
  EmiPlanSchema,
  EmiScheduleResponseSchema,
  PayEmiBodySchema,
  detectEmiSignal,
  nextDueSchedule,
  remainingAfterPayment,
  type CreateEmiPlanBody,
  type PayEmiBody,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { requireConsent } from "../lib/auth/consent.js";
import { trackServerEvent } from "../lib/analytics.js";
import { audit } from "../lib/audit.js";
import { scheduleEmiDueNudge } from "../lib/emi-jobs.js";
import type { EmiPlanRecord } from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const FromSmsBodySchema = z.object({
  body: z.string().min(1).max(2000),
  from: z.string().max(80).optional(),
  subject: z.string().max(200).optional(),
});

function toEmiJson(p: EmiPlanRecord) {
  return {
    id: p.id,
    userId: p.userId,
    provider: p.provider,
    merchant: p.merchant,
    principalMinor: p.principalMinor,
    remainingMinor: p.remainingMinor,
    installmentMinor: p.installmentMinor,
    nextDueOn: p.nextDueOn,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function advanceDueOn(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  next.setUTCMonth(next.getUTCMonth() + 1);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export const emiRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/emi",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        querystring: z.object({ status: z.enum(["ACTIVE", "PAID", "DEFAULTED"]).optional() }),
        response: { 200: EmiPlanListResponseSchema, 401: ErrorSchema },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const { status } = request.query as { status?: EmiPlanRecord["status"] };
      const plans = await app.deps.repos.listEmiPlans(userId, status ? { status } : undefined);
      return { plans: plans.map(toEmiJson) };
    },
  );

  app.post(
    "/emi",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        body: CreateEmiPlanBodySchema,
        response: { 201: EmiPlanSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as CreateEmiPlanBody;
      const remaining = body.remainingMinor ?? body.principalMinor;
      const created = await app.deps.repos.createEmiPlan({
        userId,
        provider: body.provider,
        merchant: body.merchant,
        principalMinor: body.principalMinor,
        remainingMinor: remaining,
        installmentMinor: body.installmentMinor,
        nextDueOn: body.nextDueOn,
        currency: body.currency,
      });
      await scheduleEmiDueNudge(created);
      trackServerEvent("emi_plan_created", {
        userId,
        planId: created.id,
        provider: created.provider,
        remainingMinor: created.remainingMinor,
      });
      return reply.code(201).send(toEmiJson(created));
    },
  );

  /** U007 — parse EMI due SMS text → create schedule plan (user-owned SMS; not a lender). */
  app.post(
    "/emi/from-sms",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        body: FromSmsBodySchema,
        response: {
          201: EmiPlanSchema,
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body as z.infer<typeof FromSmsBodySchema>;
      const subject = body.subject ?? (body.from ? `SMS from ${body.from}` : "SMS");
      const signal = detectEmiSignal(subject, body.body);
      if (!signal) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Could not parse an EMI due amount and date from that SMS",
        });
      }
      const created = await app.deps.repos.createEmiPlan({
        userId,
        provider: signal.provider,
        merchant: signal.merchant,
        principalMinor: signal.principalMinor,
        remainingMinor: signal.remainingMinor,
        installmentMinor: signal.installmentMinor,
        nextDueOn: signal.nextDueOn,
        currency: signal.currency,
      });
      await scheduleEmiDueNudge(created);
      trackServerEvent("emi_from_sms", {
        userId,
        planId: created.id,
        provider: created.provider,
      });
      return reply.code(201).send(toEmiJson(created));
    },
  );

  app.get(
    "/emi/:id/schedule",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        params: z.object({ id: z.string().uuid() }),
        response: { 200: EmiScheduleResponseSchema, 401: ErrorSchema, 404: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const plan = await app.deps.repos.findEmiPlan(id, userId);
      if (!plan) {
        return reply.code(404).send({ error: "Not Found", message: "EMI plan not found" });
      }
      const schedule = nextDueSchedule({
        remainingMinor: plan.remainingMinor,
        installmentMinor: plan.installmentMinor,
        nextDueOn: plan.nextDueOn,
      });
      return {
        planId: plan.id,
        remainingMinor: plan.remainingMinor,
        schedule,
      };
    },
  );

  app.post(
    "/emi/:id/pay",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["accountant"],
        params: z.object({ id: z.string().uuid() }),
        body: PayEmiBodySchema,
        response: { 200: EmiPlanSchema, 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params as { id: string };
      const body = request.body as PayEmiBody;
      const plan = await app.deps.repos.findEmiPlan(id, userId);
      if (!plan) {
        return reply.code(404).send({ error: "Not Found", message: "EMI plan not found" });
      }
      const payment = body.amountMinor ?? plan.installmentMinor;
      const remaining = remainingAfterPayment(plan.remainingMinor, payment);
      const status = remaining === 0 ? ("PAID" as const) : plan.status;
      const nextDueOn = remaining === 0 ? plan.nextDueOn : advanceDueOn(plan.nextDueOn);
      // Compare-and-set on the plan as read: a concurrent second tap gets 409, and a retry with
      // the same idempotencyKey gets the plan back without recording the installment again.
      const paid = await app.deps.repos.payEmiPlan(id, userId, {
        from: { remainingMinor: plan.remainingMinor, nextDueOn: plan.nextDueOn, status: plan.status },
        to: { remainingMinor: remaining, nextDueOn, status },
        paymentKey: body.idempotencyKey,
      });
      if (!paid) {
        return reply.code(404).send({ error: "Not Found", message: "EMI plan not found" });
      }
      if (paid.outcome === "REPLAY") return toEmiJson(paid.plan);
      if (paid.outcome === "CONFLICT") {
        return reply
          .code(409)
          .send({ error: "Conflict", message: "This plan changed while you were paying; refresh and try again" });
      }
      const updated = paid.plan;
      if (updated.status === "ACTIVE") {
        await scheduleEmiDueNudge(updated);
      }
      // U007 — ledger note for mark-paid (Closet tracker; not a payment rail).
      audit(app.log, "emi.payment", {
        userId,
        planId: id,
        provider: plan.provider,
        merchant: plan.merchant,
        paymentMinor: payment,
        remainingMinor: remaining,
        currency: plan.currency,
        note: `EMI payment ${payment} ${plan.currency} on plan ${id}`,
      });
      trackServerEvent("emi_payment", {
        userId,
        planId: id,
        paymentMinor: payment,
        remainingMinor: remaining,
      });
      return toEmiJson(updated);
    },
  );
};
