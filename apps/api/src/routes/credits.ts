import { randomUUID } from "node:crypto";
import {
  AddCreditBodySchema,
  AddCreditResponseSchema,
  BalanceCheckResponseSchema,
  CaptureCreditBodySchema,
  ConfirmBalanceBodySchema,
  ConfirmBalanceResponseSchema,
  CREDIT_SPEND_UNDO_WINDOW_MS,
  CreditCaptureResponseSchema,
  DEMO_GIFT_CARD,
  ExpiryHandledBodySchema,
  ExpiryHandledResponseSchema,
  MergeCreditsBodySchema,
  MergeCreditsResponseSchema,
  MoneyAccountKindSchema,
  MoneyAccountsResponseSchema,
  MoneyTransactionsResponseSchema,
  PageQuerySchema,
  SpendCreditBodySchema,
  SpendCreditResponseSchema,
  UndoSpendCreditBodySchema,
  UndoSpendCreditResponseSchema,
  giftCardCapturePrefill,
  merchantDeepLink,
} from "@worn/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { requireConsent } from "../lib/auth/consent.js";
import { audit } from "../lib/audit.js";
import { decodeCursor, InvalidCursorError } from "../lib/paging.js";
import { trackServerEvent } from "../lib/analytics.js";
import {
  balanceCheckMetaForAccount,
  confirmManualBalance,
  runBalanceCheck,
} from "../lib/balance-check.js";
import { scheduleBalanceRecheckReminder } from "../lib/balance-check-jobs.js";
import {
  CreditMergeError,
  mergeCreditAccounts,
} from "../lib/credit-merge.js";
import {
  CREDIT_SNOOZE_DEFAULT_MS,
  scheduleExpiryReminder,
  snoozeCreditReminder,
} from "../lib/expiry.js";
import type {
  MoneyAccountRecord,
  MoneyLedgerRecord,
} from "../lib/repositories/types.js";

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function mergeErrorStatus(code: CreditMergeError["code"]): 400 | 404 | 409 {
  if (code === "NOT_FOUND") return 404;
  if (code === "CONFLICT") return 409;
  return 400;
}

function toAccountJson(a: MoneyAccountRecord) {
  return {
    id: a.id,
    userId: a.userId,
    kind: a.kind,
    merchant: a.merchant,
    currency: a.currency,
    balanceCacheMinor: a.balanceCacheMinor,
    expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
    status: a.status,
    link: merchantDeepLink(a.merchant),
    ...balanceCheckMetaForAccount(a),
  };
}

function toLedgerJson(l: MoneyLedgerRecord) {
  return {
    id: l.id,
    userId: l.userId,
    delta: l.delta,
    type: l.type,
    refType: l.refType,
    refId: l.refId,
    balanceAfter: l.balanceAfter,
    createdAt: l.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === "23505") return true;
  const msg = (err as Error)?.message ?? "";
  return /duplicate|unique/i.test(msg);
}

function isInsufficientBalance(err: unknown): boolean {
  return (err as Error)?.message === "Insufficient money balance";
}

export const creditsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/credits",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["credits"],
        querystring: z.object({
          kind: MoneyAccountKindSchema.optional(),
        }),
        response: {
          200: MoneyAccountsResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const { kind } = request.query;
      const accounts = await app.deps.repos.listMoneyAccounts(
        userId,
        kind ? { kind } : undefined,
      );
      // CLOSED accounts stay in ledger history but leave the vault list.
      const open = accounts.filter((a) => a.status !== "CLOSED");
      audit(app.log, "money.read", { userId, kind: kind ?? null });
      return { accounts: open.map(toAccountJson) };
    },
  );

  app.get(
    "/credits/:id/transactions",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["credits"],
        params: z.object({ id: z.string().uuid() }),
        querystring: PageQuerySchema,
        response: {
          200: MoneyTransactionsResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      let after;
      try {
        after = decodeCursor(request.query.cursor);
      } catch (err) {
        if (err instanceof InvalidCursorError) return reply.code(400).send(err.body);
        throw err;
      }
      const account = await app.deps.repos.findMoneyAccount(id, userId);
      if (!account) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Credit account not found" });
      }
      const page = await app.deps.repos.listMoneyLedgerPage(id, userId, {
        limit: request.query.limit,
        after,
      });
      audit(app.log, "money.read", { userId, accountId: id });
      return {
        transactions: page.items.map(toLedgerJson),
        nextCursor: page.nextCursor,
      };
    },
  );

  app.post(
    "/credits",
    {
      // Consent is only ever granted by the user's own action (POST /consent);
      // the demo card needs it like any other credit.
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 20,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["credits"],
        body: AddCreditBodySchema,
        response: {
          201: AddCreditResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const body = request.body;
      const isDemo = body.demo === true;
      const kind = isDemo ? DEMO_GIFT_CARD.kind : body.kind;
      const merchant = isDemo ? DEMO_GIFT_CARD.merchant : body.merchant;
      const currency = isDemo
        ? DEMO_GIFT_CARD.currency
        : (body.currency ?? "INR");
      const balanceMinor = isDemo ? DEMO_GIFT_CARD.balanceMinor : body.balanceMinor;
      const expiresAt = isDemo
        ? (body.expiresAt ??
          new Date(Date.now() + 90 * 86_400_000).toISOString())
        : body.expiresAt;
      // Stable demo idempotency so retries don't mint duplicate sample cards.
      const idempotencyKey = isDemo
        ? (body.idempotencyKey ??
          // Deterministic UUID v5-ish placeholder from fixed namespace + userId
          `00000000-0000-4000-8000-${userId.replace(/-/g, "").slice(0, 12)}`)
        : body.idempotencyKey;

      // Account + first DEPOSIT in one transaction: a retry or a concurrent
      // twin with the same key gets the account that already holds it, and a
      // failure leaves no empty shell behind.
      const { account: stored, created } =
        await app.deps.repos.createMoneyAccountWithEntry({
          account: {
            userId,
            kind,
            merchant,
            currency,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            status: "ACTIVE",
          },
          entry: {
            delta: balanceMinor,
            type: "DEPOSIT",
            refType: isDemo ? "credit.demo" : "credit.add",
            refId: idempotencyKey ?? randomUUID(),
          },
        });
      if (!created) {
        return reply.code(201).send(toAccountJson(stored));
      }
      const account = stored;

      await scheduleExpiryReminder(stored);
      await scheduleBalanceRecheckReminder(stored);

      audit(app.log, "money.credit.added", {
        userId,
        accountId: account.id,
        kind,
        demo: isDemo,
        capture: body.capture
          ? {
              source: body.capture.source,
              last4: body.capture.last4 ?? null,
              code: body.capture.code ? "[redacted]" : null,
              imageKey: body.capture.imageKey ?? null,
            }
          : null,
      });
      if (body.forceDuplicate) {
        audit(app.log, "money.credit.added_override", {
          userId,
          accountId: account.id,
          nearDuplicateOf: body.nearDuplicateOf ?? null,
          merchant,
          balanceMinor,
        });
      }
      trackServerEvent("credit_added", {
        userId,
        accountId: account.id,
        kind,
        demo: isDemo,
        captureSource: body.capture?.source ?? null,
        forceDuplicate: Boolean(body.forceDuplicate),
      });
      return reply.code(201).send(toAccountJson(stored));
    },
  );


  // POST /credits/capture — barcode-only prefill (no photo)
  app.post(
    "/credits/capture",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["credits"],
        body: CaptureCreditBodySchema,
        response: {
          200: CreditCaptureResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const { barcode } = request.body;
      const parsed = giftCardCapturePrefill({ barcode });
      const capture = {
        source: "BARCODE" as const,
        raw: barcode,
        ...(parsed.code ? { code: parsed.code } : {}),
        ...(parsed.last4 ? { last4: parsed.last4 } : {}),
      };
      audit(app.log, "money.credit.captured", {
        userId,
        source: "BARCODE",
        last4: parsed.last4,
      });
      trackServerEvent("credit_captured", {
        userId,
        source: "BARCODE",
        hasMerchant: Boolean(parsed.merchant),
      });
      return {
        merchant: parsed.merchant,
        code: parsed.code,
        last4: parsed.last4,
        suggestedBalanceMinor: null,
        confidence: parsed.code ? 0.9 : 0.4,
        capture,
      };
    },
  );

  // POST /credits/capture/photo — photo (+ optional barcode) via OCR
  app.post(
    "/credits/capture/photo",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["credits"],
        consumes: ["multipart/form-data"],
        response: {
          200: CreditCaptureResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const parts = request.parts();
      let imageKey: string | null = null;
      let barcode: string | null = null;

      for await (const part of parts) {
        if (part.type === "file") {
          const buffer = await part.toBuffer();
          if (buffer.length === 0) continue;
          const key = `gift-cards/${userId}/${randomUUID()}.jpg`;
          await app.deps.storage.put({
            key,
            body: buffer,
            contentType: part.mimetype || "image/jpeg",
          });
          imageKey = key;
        } else if (part.type === "field" && part.fieldname === "barcode") {
          const val = String(part.value ?? "").trim();
          if (val) barcode = val;
        }
      }

      if (!imageKey && !barcode) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "A gift-card photo or barcode is required",
        });
      }

      let merchantHint: string | null = null;
      let ocrText: string | null = null;
      let suggestedBalanceMinor: number | null = null;
      let confidence = 0.5;

      if (imageKey) {
        const ocr = await app.deps.ocr.recognize(imageKey);
        merchantHint = ocr.merchant ?? null;
        suggestedBalanceMinor =
          typeof ocr.totalMinor === "number" && ocr.totalMinor > 0
            ? ocr.totalMinor
            : null;
        confidence = ocr.confidence;
        const rawCode =
          typeof ocr.raw.code === "string"
            ? ocr.raw.code
            : typeof ocr.raw.giftCardCode === "string"
              ? ocr.raw.giftCardCode
              : null;
        ocrText = [
          merchantHint,
          rawCode ? `Code: ${rawCode}` : null,
          typeof ocr.raw.codeLast4 === "string"
            ? `last4 ${ocr.raw.codeLast4}`
            : null,
          JSON.stringify(ocr.raw),
        ]
          .filter(Boolean)
          .join("\n");
      }

      const parsed = giftCardCapturePrefill({
        barcode,
        merchantHint,
        ocrText,
      });
      const source = imageKey ? ("PHOTO" as const) : ("BARCODE" as const);
      const capture = {
        source,
        ...(barcode ? { raw: barcode } : parsed.raw ? { raw: parsed.raw } : {}),
        ...(parsed.code ? { code: parsed.code } : {}),
        ...(parsed.last4 ? { last4: parsed.last4 } : {}),
        ...(imageKey ? { imageKey } : {}),
      };

      audit(app.log, "money.credit.captured", {
        userId,
        source,
        last4: parsed.last4,
        imageKey,
      });
      trackServerEvent("credit_captured", {
        userId,
        source,
        hasMerchant: Boolean(parsed.merchant),
      });

      return {
        merchant: parsed.merchant,
        code: parsed.code,
        last4: parsed.last4,
        suggestedBalanceMinor,
        confidence,
        capture,
      };
    },
  );

  app.post(
    "/credits/:id/spend",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 20,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["credits"],
        params: z.object({ id: z.string().uuid() }),
        body: SpendCreditBodySchema,
        response: {
          200: SpendCreditResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const { amountMinor, idempotencyKey } = request.body;

      const account = await app.deps.repos.findMoneyAccount(id, userId);
      if (!account) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Credit account not found" });
      }

      const replay = async () => {
        const prior = await app.deps.repos.findMoneyLedgerByRef(
          userId,
          idempotencyKey,
          "SPEND",
        );
        if (!prior) return null;
        if (prior.accountId !== id) {
          return reply.code(409).send({
            error: "idempotency_key_reused",
            message: "This idempotencyKey was already used on another credit",
          });
        }
        return { balanceMinor: prior.balanceAfter };
      };
      const prior = await replay();
      if (prior) return prior;

      let balanceAfter: number;
      try {
        ({ balanceAfter } = await app.deps.repos.postMoneyLedger({
          accountId: id,
          userId,
          delta: -amountMinor,
          type: "SPEND",
          refType: "credit.spend",
          refId: idempotencyKey,
        }));
      } catch (err) {
        if (isUniqueViolation(err)) {
          const raced = await replay();
          if (raced) return raced;
          return reply.code(409).send({
            error: "Conflict",
            message: "A concurrent spend with this idempotencyKey is in flight",
          });
        }
        if (isInsufficientBalance(err)) {
          return reply.code(409).send({
            error: "insufficient_balance",
            message: "Credit balance is lower than the spend amount",
          });
        }
        throw err;
      }

      audit(app.log, "money.credit.spent", {
        userId,
        accountId: id,
        amountMinor,
        idempotencyKey,
      });
      trackServerEvent("credit_spent", { userId, accountId: id, amountMinor });
      return { balanceMinor: balanceAfter };
    },
  );

  // POST /credits/:id/undo-spend — reverse SPEND within 60s (U001)
  app.post(
    "/credits/:id/undo-spend",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 20,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["credits"],
        params: z.object({ id: z.string().uuid() }),
        body: UndoSpendCreditBodySchema,
        response: {
          200: UndoSpendCreditResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const { idempotencyKey } = request.body;

      const account = await app.deps.repos.findMoneyAccount(id, userId);
      if (!account) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Credit account not found" });
      }

      const priorUndo = await app.deps.repos.findMoneyLedgerByRef(
        userId,
        idempotencyKey,
        "DEPOSIT",
      );
      if (
        priorUndo &&
        priorUndo.refType === "credit.spend.undo" &&
        priorUndo.accountId === id
      ) {
        return { balanceMinor: priorUndo.balanceAfter, undone: true };
      }

      const spend = await app.deps.repos.findMoneyLedgerByRef(
        userId,
        idempotencyKey,
        "SPEND",
      );
      if (!spend || spend.accountId !== id) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Spend not found for undo",
        });
      }

      const ageMs = Date.now() - spend.createdAt.getTime();
      if (ageMs > CREDIT_SPEND_UNDO_WINDOW_MS) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Undo window expired (60s)",
        });
      }

      const amountMinor = -spend.delta;
      if (amountMinor <= 0) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Spend entry is not undoable",
        });
      }

      let balanceAfter: number;
      try {
        ({ balanceAfter } = await app.deps.repos.postMoneyLedger({
          accountId: id,
          userId,
          delta: amountMinor,
          type: "DEPOSIT",
          refType: "credit.spend.undo",
          refId: idempotencyKey,
        }));
      } catch (err) {
        if (isUniqueViolation(err)) {
          const raced = await app.deps.repos.findMoneyLedgerByRef(
            userId,
            idempotencyKey,
            "DEPOSIT",
          );
          if (raced?.accountId === id && raced.refType === "credit.spend.undo") {
            return { balanceMinor: raced.balanceAfter, undone: true };
          }
          // The key already holds a different DEPOSIT (e.g. the add that
          // created a credit), so this undo can never post.
          return reply.code(409).send({
            error: "idempotency_key_reused",
            message: "This idempotencyKey was already used for another deposit",
          });
        }
        throw err;
      }

      audit(app.log, "money.credit.spend_undone", {
        userId,
        accountId: id,
        amountMinor,
        idempotencyKey,
      });
      trackServerEvent("credit_spend_undone", {
        userId,
        accountId: id,
        amountMinor,
      });
      return { balanceMinor: balanceAfter, undone: true };
    },
  );

  // POST /credits/merge — same merchant+currency twins → one account (U002)
  app.post(
    "/credits/merge",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 20,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["credits"],
        body: MergeCreditsBodySchema,
        response: {
          200: MergeCreditsResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      try {
        const result = await mergeCreditAccounts(app.deps.repos, userId, {
          targetAccountId: request.body.targetAccountId,
          sourceAccountId: request.body.sourceAccountId,
        });
        audit(app.log, "money.credit.merged", {
          userId,
          targetAccountId: result.account.id,
          sourceAccountId: result.mergedFromId,
          transferredMinor: result.transferredMinor,
        });
        trackServerEvent("credits_merged", {
          userId,
          targetAccountId: result.account.id,
          sourceAccountId: result.mergedFromId,
          transferredMinor: result.transferredMinor,
        });
        return {
          account: toAccountJson(result.account),
          mergedFromId: result.mergedFromId,
          transferredMinor: result.transferredMinor,
        };
      } catch (error) {
        if (error instanceof CreditMergeError) {
          return reply
            .code(mergeErrorStatus(error.code))
            .send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  // POST /credits/:id/expiry-handled — checklist done → snooze push 7d (U003)
  app.post(
    "/credits/:id/expiry-handled",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["credits"],
        params: z.object({ id: z.string().uuid() }),
        body: ExpiryHandledBodySchema,
        response: {
          200: ExpiryHandledResponseSchema,
          400: ErrorSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const account = await app.deps.repos.findMoneyAccount(id, userId);
      if (!account) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Credit account not found" });
      }

      const nowMs = Date.now();
      const snoozedUntil = request.body.until
        ? new Date(request.body.until)
        : new Date(nowMs + CREDIT_SNOOZE_DEFAULT_MS);

      if (snoozedUntil.getTime() <= nowMs) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Snooze until must be in the future",
        });
      }

      const status = await snoozeCreditReminder(account, snoozedUntil);
      audit(app.log, "money.credit.expiry_handled", {
        userId,
        accountId: id,
        snoozedUntil: snoozedUntil.toISOString(),
        status,
      });
      trackServerEvent("credit_expiry_handled", {
        userId,
        accountId: id,
      });
      return {
        accountId: id,
        snoozedUntil: snoozedUntil.toISOString(),
        status,
      };
    },
  );

  // POST /credits/:id/balance-check — API refresh or manual re-check hint
  app.post(
    "/credits/:id/balance-check",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["credits"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: BalanceCheckResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const account = await app.deps.repos.findMoneyAccount(id, userId);
      if (!account) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Credit account not found" });
      }
      const result = await runBalanceCheck(app.deps.repos, account);
      audit(app.log, "money.credit.balance_check", {
        userId,
        accountId: id,
        mode: result.mode,
        refreshed: result.refreshed,
      });
      return result;
    },
  );

  // POST /credits/:id/confirm-balance — user-confirmed merchant balance
  app.post(
    "/credits/:id/confirm-balance",
    {
      preHandler: [requireAuth, requireConsent("FINANCIAL")],
      schema: {
        tags: ["credits"],
        params: z.object({ id: z.string().uuid() }),
        body: ConfirmBalanceBodySchema,
        response: {
          200: ConfirmBalanceResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
          409: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { id } = request.params;
      const { balanceMinor, idempotencyKey } = request.body;
      const account = await app.deps.repos.findMoneyAccount(id, userId);
      if (!account) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Credit account not found" });
      }
      const keyReused = () =>
        reply.code(409).send({
          error: "idempotency_key_reused",
          message: "This idempotencyKey was already used on another credit",
        });
      if (idempotencyKey) {
        for (const type of ["DEPOSIT", "SPEND"] as const) {
          const prior = await app.deps.repos.findMoneyLedgerByRef(
            userId,
            idempotencyKey,
            type,
          );
          if (!prior) continue;
          if (prior.accountId !== id) return keyReused();
          return { balanceMinor: prior.balanceAfter, adjusted: true };
        }
      }
      let result: Awaited<ReturnType<typeof confirmManualBalance>>;
      try {
        result = await confirmManualBalance(app.deps.repos, account, balanceMinor, {
          idempotencyKey,
        });
      } catch (err) {
        if ((err as Error)?.message === "Money ledger ref belongs to another account") {
          return keyReused();
        }
        throw err;
      }
      audit(app.log, "money.credit.balance_confirmed", {
        userId,
        accountId: id,
        balanceMinor: result.balanceMinor,
        adjusted: result.adjusted,
      });
      return result;
    },
  );
};
