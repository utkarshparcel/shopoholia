import {
  CorrectIngestionDocumentBodySchema,
  CorrectIngestionDocumentResponseSchema,
  CreateIngestionSourceResponseSchema,
  IngestionActivityResponseSchema,
  IngestionKindSchema,
  IngestionSourcesResponseSchema,
  IngestSmsBodySchema,
  IngestSmsResponseSchema,
  PatchIngestionSourceBodySchema,
  mapAccountHealth,
} from "@worn/shared";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireAuth } from "../lib/auth/guard.js";
import { requireConsent } from "../lib/auth/consent.js";
import { audit } from "../lib/audit.js";
import { trackServerEvent } from "../lib/analytics.js";
import { toIngestionActivityItem } from "../lib/ingestion-activity.js";
import {
  publishIngestJob,
  publishOauthCompleteJob,
} from "../lib/ingest-queue.js";
import {
  buildParserTrainingFixture,
  parserFeedbackAnalyticsPayload,
} from "../lib/parser-training.js";
import {
  buildUnknownMerchantQueue,
  merchantPickerOptions,
  reprocessWindowFields,
  upsertMerchantAlias,
} from "../lib/merchant-alias.js";
import {
  createMuteRule,
  muteRulesFromMeta,
  previewMuteRule,
  removeMuteRule,
  writeMuteRulesToMeta,
} from "../lib/mute-rules.js";
import { computeLastSyncScopeDiff } from "../lib/consent-scope-diff.js";
import {
  computeRetentionCountdown,
  listRetentionCountdowns,
} from "../lib/retention-countdown.js";
import {
  buildParserBreakBanner,
  dismissParserBreakBanner,
  listParserBreakFlags,
  setParserBreakFlag,
} from "../lib/parser-break-banner.js";
// Retention: raw ingestion_documents use a per-kind TTL (EMAIL 7d / SMS 14d /
// RECEIPT 30d by default; see apps/api/src/lib/retention.ts) then purged via
// purgeExpiredIngestionDocuments after PARSED/MATCHED/UNMATCHED. R2 objects
// are SSE-S3 encrypted at rest (see lib/storage/r2.ts) and tokens are
// AES-256-GCM encrypted at rest (see services/worker-ingest/src/crypto.ts).

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function gmailRedirectUri(): string {
  const base = process.env.API_PUBLIC_URL ?? "https://api.shopoholia.app";
  return `${base.replace(/\/$/, "")}/ingestion/sources/oauth/callback`;
}

// ---------------------------------------------------------------------------
// Signed OAuth state — HMAC-SHA256 over the JSON payload with
// OAUTH_STATE_SECRET (falls back to JWT_ACCESS_SECRET, then dev fallback).
// Flow:
//  1. POST /ingestion/sources (auth required) builds OAuth URL: payload
//     {userId, sourceId, kind} → signState() → state=encodeURIComponent(json+ "."+hmac)
//  2. Google redirects to GET /ingestion/sources/oauth/callback?code=&state= (no session)
//  3. Callback verifies HMAC via verifyState(), extracts userId/sourceId, validates
//     source + consent, enqueues oauth-complete job for the worker to exchange
//     the code for tokens (encrypted at rest). No requireAuth is needed on the
//     callback; a legacy unsigned state is accepted only as a fallback when a
//     valid JWT is present and matches the state (for backwards compat / tests).
// ---------------------------------------------------------------------------

export function oauthStateSecret(): string {
  return process.env.OAUTH_STATE_SECRET ?? process.env.JWT_ACCESS_SECRET ?? "dev-only-change-me";
}

export function signState(payload: { userId: string; sourceId: string; kind: string }): string {
  const json = JSON.stringify(payload);
  const sig = createHmac("sha256", oauthStateSecret()).update(json).digest("hex");
  return `${json}.${sig}`;
}

export function verifyState(state: string): { userId: string; sourceId: string; kind?: string } | null {
  try {
    const decoded = decodeURIComponent(state);
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return null;
    const jsonPart = decoded.slice(0, lastDot);
    const sigPart = decoded.slice(lastDot + 1);
    const expected = createHmac("sha256", oauthStateSecret()).update(jsonPart).digest("hex");
    const a = Buffer.from(sigPart, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(jsonPart) as { userId: string; sourceId: string; kind?: string };
    if (!payload.userId || !payload.sourceId) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildGmailOauthUrl(userId: string, sourceId: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "MISSING_GOOGLE_CLIENT_ID";
  // GOOGLE_CLIENT_SECRET is not needed to build the consent URL (auth-code
  // flow uses it only in the token exchange), but we read it here to
  // document that the full flow requires it: this route builds the OAuth
  // consent URL with {userId, sourceId} in `state`; the callback at
  // GET /ingestion/sources/oauth/callback then enqueues an oauth-complete
  // job and the worker (services/worker-ingest GmailConnector.completeOAuth)
  // exchanges `code` for tokens using GOOGLE_CLIENT_SECRET and stores them
  // encrypted. Best-effort without live creds: falls back to a mock URL
  // (MISSING_GOOGLE_CLIENT_ID) so local/test runs still work.
  void (process.env.GOOGLE_CLIENT_SECRET ?? "");
  const redirectUri = gmailRedirectUri();
  const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly");
  const signed = signState({ userId, sourceId, kind: "EMAIL" });
  const state = encodeURIComponent(signed);
  // NOTE(B2 resolved): OAuth URL → callback → encrypted token store. See
  // services/worker-ingest/src/connectors/gmail.ts completeOAuth and
  // services/worker-ingest/src/index.ts createGmailConnectorForSource.
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${state}`;
}

const CreateIngestionSourceBodySchema = z.object({
  kind: IngestionKindSchema.default("EMAIL"),
  provider: z.string().min(1),
});

function toSourceJson(s: {
  id: string;
  kind: "EMAIL" | "SMS" | "RECEIPT";
  provider: string;
  consentGrantId: string;
  status: "IDLE" | "SYNCING" | "PAUSED" | "ERROR";
  cursor: string | null;
  lastSyncAt: Date | null;
  encryptedToken?: { data: string } | null;
  meta?: Record<string, unknown> | null;
}) {
  const lastSyncAt = s.lastSyncAt ? s.lastSyncAt.toISOString() : null;
  const hasToken = Boolean(s.encryptedToken?.data);
  const health = mapAccountHealth({
    status: s.status,
    lastSyncAt,
    hasToken,
    meta: s.meta ?? null,
  });
  return {
    id: s.id,
    kind: s.kind,
    provider: s.provider,
    consentGrantId: s.consentGrantId,
    status: s.status,
    cursor: s.cursor,
    lastSyncAt,
    meta: s.meta ?? null,
    error: health.error,
    hasToken,
    health,
  };
}

async function documentBelongsToUser(
  repos: {
    listIngestionDocumentsByUser(userId: string): Promise<{ id: string }[]>;
    getIngestionDocumentById(id: string): Promise<{
      parsedJson: Record<string, unknown>;
    } | null>;
  },
  userId: string,
  documentId: string,
): Promise<boolean> {
  const docs = await repos.listIngestionDocumentsByUser(userId);
  if (docs.some((d) => d.id === documentId)) return true;
  const doc = await repos.getIngestionDocumentById(documentId);
  if (!doc) return false;
  return doc.parsedJson.__userId === userId;
}

export const ingestionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/ingestion/sources",
    {
      preHandler: [requireAuth, requireConsent("EMAIL")],
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 10,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["ingestion"],
        body: CreateIngestionSourceBodySchema,
        response: {
          201: CreateIngestionSourceResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { kind, provider } = request.body;

      const grant = await app.deps.repos.findActiveConsent(userId, "EMAIL");
      if (!grant) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Missing active EMAIL consent",
        });
      }

      const source = await app.deps.repos.createIngestionSource({
        userId,
        kind: kind ?? "EMAIL",
        provider,
        consentGrantId: grant.id,
      });

      const oauthUrl = buildGmailOauthUrl(userId, source.id);
      audit(app.log, "ingestion.source.created", { userId, sourceId: source.id });
      trackServerEvent("ingestion_connected", { userId, sourceId: source.id, kind });
      return reply.code(201).send({ source: toSourceJson(source), oauthUrl });
    },
  );

  app.get(
    "/ingestion/sources",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        response: {
          200: IngestionSourcesResponseSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const sources = await app.deps.repos.listIngestionSources(userId);
      return { sources: sources.map(toSourceJson) };
    },
  );

  app.delete(
    "/ingestion/sources/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          204: z.null(),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const source = await app.deps.repos.getIngestionSourceById(request.params.id);
      if (!source) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const owned = await app.deps.repos.listIngestionSources(userId);
      if (!owned.some((s) => s.id === source.id)) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }

      const disconnected = await app.deps.repos.disconnectIngestionSource(source.id);
      if (!disconnected) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }

      audit(app.log, "ingestion.source.disconnected", {
        userId,
        sourceId: disconnected.id,
        kind: disconnected.kind,
        provider: disconnected.provider,
      });
      trackServerEvent("ingestion_source_disconnected", {
        userId,
        sourceId: disconnected.id,
        kind: disconnected.kind,
      });
      return reply.code(204).send(undefined as never);
    },
  );

  app.patch(
    "/ingestion/sources/:id",
    {
      preHandler: [requireAuth, requireConsent("EMAIL")],
      schema: {
        tags: ["ingestion"],
        params: z.object({ id: z.string().uuid() }),
        body: PatchIngestionSourceBodySchema,
        response: {
          200: z.object({ source: CreateIngestionSourceResponseSchema.shape.source }),
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const source = await app.deps.repos.getIngestionSourceById(request.params.id);
      if (!source) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const owned = await app.deps.repos.listIngestionSources(userId);
      if (!owned.some((s) => s.id === source.id)) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }

      const nextMeta: Record<string, unknown> = {
        ...(source.meta ?? {}),
      };
      if (request.body.mutedMerchants !== undefined) {
        nextMeta.mutedMerchants = request.body.mutedMerchants;
      }
      if (request.body.muteRules !== undefined) {
        nextMeta.muteRules = request.body.muteRules;
      }

      const metaChanged =
        request.body.mutedMerchants !== undefined ||
        request.body.muteRules !== undefined;

      const updated = await app.deps.repos.updateIngestionSource(source.id, {
        status: request.body.status,
        meta: metaChanged ? nextMeta : source.meta,
      });
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }

      audit(app.log, "ingestion.source.updated", {
        userId,
        sourceId: updated.id,
        status: updated.status,
        mutedMerchants: (updated.meta as { mutedMerchants?: string[] } | null)?.mutedMerchants ?? null,
        muteRuleCount: muteRulesFromMeta(updated.meta).length,
      });
      if (request.body.status === "PAUSED") {
        trackServerEvent("ingestion_source_paused", { userId, sourceId: updated.id });
      }
      if (request.body.mutedMerchants !== undefined) {
        trackServerEvent("ingestion_merchant_muted", {
          userId,
          sourceId: updated.id,
          count: request.body.mutedMerchants.length,
        });
      }
      if (request.body.muteRules !== undefined) {
        trackServerEvent("ingestion_mute_rules_updated", {
          userId,
          sourceId: updated.id,
          count: request.body.muteRules.length,
        });
      }

      return { source: toSourceJson(updated) };
    },
  );

  // Gmail OAuth redirect target. Verifies signed state (HMAC) so the redirect
  // can succeed without an active session; falls back to JWT verification if
  // the state is legacy unsigned JSON (backwards compat). The worker owns the
  // token exchange + encryption at rest, so the API never handles plaintext
  // tokens.
  app.get(
    "/ingestion/sources/oauth/callback",
    {
      // Intentionally no requireAuth — the signed state is the credential.
      // See signState/verifyState above.
      schema: {
        tags: ["ingestion"],
        querystring: z.object({
          code: z.string().min(1),
          state: z.string().min(1),
        }),
        response: {
          202: z.object({ status: z.string(), sourceId: z.string() }),
          400: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const rawState = request.query.state;
      let statePayload = verifyState(rawState);

      // Fallback: legacy unsigned state is accepted only if the caller
      // presents a valid JWT that matches the state (keeps requireAuth as
      // fallback for backwards compat / tests).
      if (!statePayload) {
        try {
          const legacy = JSON.parse(decodeURIComponent(rawState)) as {
            userId: string;
            sourceId: string;
          };
          if (legacy.userId && legacy.sourceId) {
            // Try to authenticate via JWT if present
            let authedUserId: string | null = null;
            try {
              await request.jwtVerify<{ sub: string }>();
              authedUserId = (request as unknown as { user: { sub: string } }).user?.sub ?? null;
            } catch {
              // no valid JWT — will be treated as invalid state below
            }
            if (authedUserId && legacy.userId === authedUserId) {
              statePayload = legacy;
            }
          }
        } catch {
          // ignore — will return 400 below
        }
      }

      if (!statePayload) {
        return reply.code(400).send({ error: "Bad Request", message: "Invalid state" });
      }

      // If the request also carries a valid JWT, enforce that it matches the signed state
      try {
        await request.jwtVerify<{ sub: string }>();
        const authed = (request as unknown as { user: { sub: string } }).user?.sub;
        if (authed && authed !== statePayload.userId) {
          return reply.code(403).send({ error: "Forbidden", message: "State mismatch" });
        }
      } catch {
        // No JWT — signed state is sufficient, no auth required
      }

      const userId = statePayload.userId;

      const source = await app.deps.repos.getIngestionSourceById(statePayload.sourceId);
      if (!source) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }

      // Bind OAuth completion to the source's consent grant — revoke/re-grant
      // issues a new grant id, so stale sources cannot complete OAuth.
      const activeConsents = await app.deps.repos.listActiveConsents(userId);
      if (!activeConsents.some((g) => g.id === source.consentGrantId)) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Source consent grant is not active",
        });
      }

      const status = await publishOauthCompleteJob({
        sourceId: source.id,
        code: request.query.code,
        userId,
      });
      if (status === "skipped") {
        app.log.warn(
          { sourceId: source.id },
          "ingestion.oauth.enqueue.skipped: no Redis configured",
        );
      }

      audit(app.log, "ingestion.oauth.initiated", { userId, sourceId: source.id });
      return reply
        .code(202)
        .send({ status: "pending", sourceId: source.id });
    },
  );

  async function listActivityForUser(userId: string, kindFilter?: "EMAIL" | "SMS" | "RECEIPT") {
    const docs = await app.deps.repos.listIngestionDocumentsByUser(userId);
    const filtered = kindFilter ? docs.filter((d) => d.kind === kindFilter) : docs;
    const purchaseIds = filtered
      .map((d) => d.matchedPurchaseId)
      .filter((id): id is string => Boolean(id));
    const purchaseMap = new Map(
      (
        await Promise.all(
          purchaseIds.map(async (id) => {
            const p = await app.deps.repos.findMerchantPurchaseById(id);
            return p ? ([id, p] as const) : null;
          }),
        )
      ).filter((x): x is readonly [string, NonNullable<typeof x>[1]] => Boolean(x)),
    );

    const items = filtered.slice(0, 50).map((doc) =>
      toIngestionActivityItem(
        doc,
        doc.matchedPurchaseId ? purchaseMap.get(doc.matchedPurchaseId) : null,
      ),
    );
    return { items };
  }

  app.get(
    "/ingestion/activity",
    {
      preHandler: [requireAuth, requireConsent("EMAIL")],
      schema: {
        tags: ["ingestion"],
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
        response: {
          200: IngestionActivityResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const result = await listActivityForUser(userId);
      const limit = request.query.limit ?? 50;
      trackServerEvent("ingestion_activity_viewed", {
        userId,
        count: Math.min(result.items.length, limit),
      });
      return { items: result.items.slice(0, limit) };
    },
  );

  app.get(
    "/ingestion/sources/:id/reads",
    {
      preHandler: [requireAuth, requireConsent("EMAIL")],
      schema: {
        tags: ["ingestion"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: IngestionActivityResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const source = await app.deps.repos.getIngestionSourceById(request.params.id);
      if (!source) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const owned = await app.deps.repos.listIngestionSources(userId);
      if (!owned.some((s) => s.id === source.id)) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const result = await listActivityForUser(userId, source.kind);
      trackServerEvent("ingestion_activity_viewed", {
        userId,
        sourceId: source.id,
        count: result.items.length,
      });
      return result;
    },
  );

  app.post(
    "/ingestion/documents/:id/correct",
    {
      preHandler: [requireAuth, requireConsent("EMAIL")],
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 30,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["ingestion"],
        params: z.object({ id: z.string().uuid() }),
        body: CorrectIngestionDocumentBodySchema,
        response: {
          200: CorrectIngestionDocumentResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const docId = request.params.id;
      const owns = await documentBelongsToUser(app.deps.repos, userId, docId);
      if (!owns) {
        return reply.code(404).send({ error: "Not Found", message: "Document not found" });
      }

      const doc = await app.deps.repos.getIngestionDocumentById(docId);
      if (!doc) {
        return reply.code(404).send({ error: "Not Found", message: "Document not found" });
      }

      const prev = doc.parsedJson ?? {};
      const nextParsed: Record<string, unknown> = {
        ...prev,
        __userId: userId,
        correctedAt: new Date().toISOString(),
        correctedBy: "user",
      };
      if (request.body.merchant !== undefined) nextParsed.merchant = request.body.merchant;
      if (request.body.totalMinor !== undefined) nextParsed.totalMinor = request.body.totalMinor;
      if (request.body.currency !== undefined) nextParsed.currency = request.body.currency;
      if (request.body.items !== undefined) {
        nextParsed.items = request.body.items.map((item) => ({
          title: item.title,
          priceMinor: item.priceMinor,
          qty: item.qty ?? 1,
          category: item.category ?? null,
        }));
      }

      const updated = await app.deps.repos.updateIngestionDocumentParsedJson(docId, nextParsed);
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Document not found" });
      }

      let purchaseMerchant: string | null =
        typeof nextParsed.merchant === "string" ? nextParsed.merchant : null;
      let purchaseTotal: number | null =
        typeof nextParsed.totalMinor === "number" ? nextParsed.totalMinor : null;
      let purchaseCurrency: string | null =
        typeof nextParsed.currency === "string" ? nextParsed.currency : null;

      if (updated.matchedPurchaseId) {
        const purchase = await app.deps.repos.findMerchantPurchaseById(updated.matchedPurchaseId);
        if (purchase && purchase.userId === userId) {
          const patched = await app.deps.repos.updateMerchantPurchase(purchase.id, {
            merchant: request.body.merchant,
            totalMinor: request.body.totalMinor,
            currency: request.body.currency,
          });
          if (request.body.items) {
            await app.deps.repos.replaceMerchantPurchaseItems(
              purchase.id,
              request.body.items.map((item) => ({
                title: item.title,
                priceMinor: item.priceMinor,
                qty: item.qty ?? 1,
                category: item.category ?? null,
              })),
            );
          }
          if (patched) {
            purchaseMerchant = patched.merchant;
            purchaseTotal = patched.totalMinor;
            purchaseCurrency = patched.currency;
          }
        }
      }

      const correctedFields = Object.keys(request.body);
      const fixture = buildParserTrainingFixture({
        documentId: docId,
        kind: updated.kind,
        beforeParsed: prev,
        afterParsed: nextParsed,
        correctedFields,
        enqueueExport: true,
      });

      audit(app.log, "ingestion.document.corrected", {
        userId,
        documentId: docId,
        matchedPurchaseId: updated.matchedPurchaseId,
        fields: correctedFields,
        fixtureId: fixture.id,
      });
      audit(app.log, "ingestion.fixture.exported", {
        userId,
        documentId: docId,
        fixtureId: fixture.id,
        merchantHint: fixture.merchantHint,
        exportQueued: fixture.exportQueued,
      });
      trackServerEvent("ingestion_corrected", {
        userId,
        documentId: docId,
        matchedPurchaseId: updated.matchedPurchaseId,
      });
      trackServerEvent("parser_feedback", {
        userId,
        ...parserFeedbackAnalyticsPayload(fixture),
        totalMinor: purchaseTotal,
        currency: purchaseCurrency,
      });

      return {
        id: updated.id,
        status: updated.status,
        matchedPurchaseId: updated.matchedPurchaseId,
        merchant: purchaseMerchant,
        totalMinor: purchaseTotal,
        currency: purchaseCurrency,
        fixtureId: fixture.id,
        exportQueued: fixture.exportQueued,
      };
    },
  );

  app.post(
    "/ingestion/sms",
    {
      preHandler: [requireAuth, requireConsent("SMS")],
      config: {
        rateLimit: {
          max: process.env.NODE_ENV === "test" ? 1000 : 30,
          timeWindow: "1 minute",
        },
      },
      schema: {
        tags: ["ingestion"],
        body: IngestSmsBodySchema,
        response: {
          202: IngestSmsResponseSchema,
          401: ErrorSchema,
          403: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { from, body, receivedAt } = request.body;

      const rawKey = `ingestion/sms/${userId}/${randomUUID()}`;
      const doc = await app.deps.repos.createIngestionDocument({
        userId,
        kind: "SMS",
        rawKey,
        parsedJson: {
          from,
          body,
          receivedAt: receivedAt ?? new Date().toISOString(),
        },
      });

      await publishIngestJob({ kind: "SMS", documentId: doc.id, userId });
      audit(app.log, "ingestion.sms.received", { userId, documentId: doc.id });
      trackServerEvent("sms_ingested", { userId, documentId: doc.id });

      return reply.code(202).send({ id: doc.id, status: doc.status });
    },
  );

  // U042 — unknown merchant queue + alias resolve
  app.get(
    "/ingestion/unknown-merchants",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        response: {
          200: z.object({
            items: z.array(
              z.object({
                documentId: z.string().uuid(),
                kind: z.string(),
                rawMerchant: z.string().nullable(),
                matchedPurchaseId: z.string().uuid().nullable(),
                createdAt: z.string().datetime(),
              }),
            ),
            picker: z.array(z.string()),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const docs = await app.deps.repos.listIngestionDocumentsByUser(userId);
      return {
        items: buildUnknownMerchantQueue(docs),
        picker: merchantPickerOptions(userId),
      };
    },
  );

  app.post(
    "/ingestion/merchant-aliases",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        body: z.object({
          alias: z.string().min(1),
          canonical: z.string().min(1),
          documentId: z.string().uuid().optional(),
        }),
        response: {
          200: z.object({
            alias: z.string(),
            canonical: z.string(),
            reprocessedPurchaseId: z.string().uuid().nullable(),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { alias, canonical, documentId } = request.body;
      const row = upsertMerchantAlias(userId, alias, canonical);
      let reprocessedPurchaseId: string | null = null;

      if (documentId) {
        const owns = await documentBelongsToUser(app.deps.repos, userId, documentId);
        if (!owns) {
          return reply.code(404).send({ error: "Not Found", message: "Document not found" });
        }
        const doc = await app.deps.repos.getIngestionDocumentById(documentId);
        if (!doc) {
          return reply.code(404).send({ error: "Not Found", message: "Document not found" });
        }
        const nextParsed = {
          ...(doc.parsedJson ?? {}),
          merchant: row.canonical,
          __userId: userId,
        };
        await app.deps.repos.updateIngestionDocumentParsedJson(documentId, nextParsed);
        if (doc.matchedPurchaseId) {
          const purchase = await app.deps.repos.findMerchantPurchaseById(doc.matchedPurchaseId);
          if (purchase && purchase.userId === userId) {
            const windows = reprocessWindowFields({
              purchasedAt: purchase.purchasedAt,
              merchant: row.canonical,
            });
            await app.deps.repos.updateMerchantPurchase(purchase.id, {
              merchant: row.canonical,
              returnWindowDeadline: windows.returnWindowDeadline,
              exchangeWindowDeadline: windows.exchangeWindowDeadline,
            });
            reprocessedPurchaseId = purchase.id;
          }
        }
      }

      audit(app.log, "ingestion.merchant.aliased", {
        userId,
        alias: row.alias,
        canonical: row.canonical,
        documentId: documentId ?? null,
        reprocessedPurchaseId,
      });
      trackServerEvent("ingestion_merchant_aliased", {
        userId,
        canonical: row.canonical,
      });
      return {
        alias: row.alias,
        canonical: row.canonical,
        reprocessedPurchaseId,
      };
    },
  );

  // U043 — mute rule preview + create + undo
  app.post(
    "/ingestion/sources/:id/mute-preview",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          type: z.enum(["merchant", "sender", "subject"]),
          pattern: z.string().min(1),
        }),
        response: {
          200: z.object({
            count: z.number().int().nonnegative(),
            matches: z.array(
              z.object({
                documentId: z.string(),
                kind: z.string(),
                merchant: z.string().nullable(),
                subject: z.string().nullable(),
                from: z.string().nullable(),
              }),
            ),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const source = await app.deps.repos.getIngestionSourceById(request.params.id);
      if (!source) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const owned = await app.deps.repos.listIngestionSources(userId);
      if (!owned.some((s) => s.id === source.id)) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const docs = await app.deps.repos.listIngestionDocumentsByUser(userId);
      return previewMuteRule(request.body, docs);
    },
  );

  app.post(
    "/ingestion/sources/:id/mute-rules",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          type: z.enum(["merchant", "sender", "subject"]),
          pattern: z.string().min(1),
        }),
        response: {
          200: z.object({
            rule: z.object({
              id: z.string(),
              type: z.enum(["merchant", "sender", "subject"]),
              pattern: z.string(),
              mutedAt: z.string().datetime(),
              previewCount: z.number().int(),
            }),
            undoDays: z.number().int(),
          }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const source = await app.deps.repos.getIngestionSourceById(request.params.id);
      if (!source) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const owned = await app.deps.repos.listIngestionSources(userId);
      if (!owned.some((s) => s.id === source.id)) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const docs = await app.deps.repos.listIngestionDocumentsByUser(userId);
      const preview = previewMuteRule(request.body, docs);
      const rule = createMuteRule({
        type: request.body.type,
        pattern: request.body.pattern,
        previewCount: preview.count,
      });
      const nextRules = [...muteRulesFromMeta(source.meta), rule];
      const updated = await app.deps.repos.updateIngestionSource(source.id, {
        meta: writeMuteRulesToMeta(source.meta, nextRules),
      });
      if (!updated) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      audit(app.log, "ingestion.mute.rule", {
        userId,
        sourceId: source.id,
        ruleId: rule.id,
        type: rule.type,
        previewCount: rule.previewCount,
      });
      return { rule, undoDays: 7 };
    },
  );

  app.delete(
    "/ingestion/sources/:id/mute-rules/:ruleId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        params: z.object({ id: z.string().uuid(), ruleId: z.string().min(1) }),
        response: {
          200: z.object({ undone: z.boolean(), error: z.string().nullable() }),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const source = await app.deps.repos.getIngestionSourceById(request.params.id);
      if (!source) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const owned = await app.deps.repos.listIngestionSources(userId);
      if (!owned.some((s) => s.id === source.id)) {
        return reply.code(404).send({ error: "Not Found", message: "Source not found" });
      }
      const result = removeMuteRule(
        muteRulesFromMeta(source.meta),
        request.params.ruleId,
      );
      if (result.error === "not_found") {
        return reply.code(404).send({ error: "Not Found", message: "Mute rule not found" });
      }
      if (result.error === "undo_expired") {
        return { undone: false, error: "undo_expired" };
      }
      await app.deps.repos.updateIngestionSource(source.id, {
        meta: writeMuteRulesToMeta(source.meta, result.rules),
      });
      audit(app.log, "ingestion.mute.undone", {
        userId,
        sourceId: source.id,
        ruleId: request.params.ruleId,
      });
      return { undone: true, error: null };
    },
  );

  // U044 — last sync scope chips + counts
  app.get(
    "/ingestion/last-sync",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        response: {
          200: z.object({
            lastSyncAt: z.string().datetime().nullable(),
            scopes: z.array(
              z.object({
                scope: z.string(),
                used: z.boolean(),
                docCount: z.number().int(),
                label: z.string(),
              }),
            ),
            totalDocs: z.number().int(),
            note: z.string(),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const [sources, documents, consents] = await Promise.all([
        app.deps.repos.listIngestionSources(userId),
        app.deps.repos.listIngestionDocumentsByUser(userId),
        app.deps.repos.listActiveConsents(userId),
      ]);
      return computeLastSyncScopeDiff({
        sources,
        documents,
        activeScopes: consents.map((c) => c.scope),
      });
    },
  );

  // U045 — retention countdown + delete raw now
  app.get(
    "/ingestion/retention",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        response: {
          200: z.object({
            items: z.array(
              z.object({
                documentId: z.string().uuid(),
                kind: z.enum(["EMAIL", "SMS", "RECEIPT"]),
                createdAt: z.string().datetime(),
                retentionDays: z.number().int(),
                expiresAt: z.string().datetime(),
                daysRemaining: z.number().int(),
                rawPresent: z.boolean(),
                matchedPurchaseId: z.string().uuid().nullable(),
              }),
            ),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      const docs = await app.deps.repos.listIngestionDocumentsByUser(userId);
      return { items: listRetentionCountdowns(docs) };
    },
  );

  app.post(
    "/ingestion/documents/:id/delete-raw",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ confirm: z.literal(true) }),
        response: {
          200: z.object({
            id: z.string().uuid(),
            rawDeleted: z.boolean(),
            matchedPurchaseId: z.string().uuid().nullable(),
            countdown: z
              .object({
                daysRemaining: z.number().int(),
                expiresAt: z.string().datetime(),
              })
              .nullable(),
          }),
          400: ErrorSchema,
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const docId = request.params.id;
      if (!request.body.confirm) {
        return reply.code(400).send({ error: "Bad Request", message: "confirm required" });
      }
      const owns = await documentBelongsToUser(app.deps.repos, userId, docId);
      if (!owns) {
        return reply.code(404).send({ error: "Not Found", message: "Document not found" });
      }
      const doc = await app.deps.repos.getIngestionDocumentById(docId);
      if (!doc) {
        return reply.code(404).send({ error: "Not Found", message: "Document not found" });
      }
      const before = computeRetentionCountdown(doc);
      if (doc.rawKey) {
        await app.deps.storage.delete(doc.rawKey).catch(() => undefined);
      }
      await app.deps.repos.purgeIngestionDocumentRaw(docId);
      audit(app.log, "ingestion.raw.deleted", {
        userId,
        documentId: docId,
        matchedPurchaseId: doc.matchedPurchaseId,
      });
      trackServerEvent("ingestion_raw_deleted", {
        userId,
        documentId: docId,
        kind: doc.kind,
      });
      return {
        id: docId,
        rawDeleted: true,
        matchedPurchaseId: doc.matchedPurchaseId,
        countdown: before
          ? { daysRemaining: before.daysRemaining, expiresAt: before.expiresAt }
          : null,
      };
    },
  );

  // U050 — parser break banner
  app.get(
    "/ingestion/parser-health",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        response: {
          200: z.object({
            banner: z.object({
              visible: z.boolean(),
              title: z.string(),
              body: z.string(),
              manualAddLabel: z.string(),
              manualAddHref: z.string(),
              dismissLabel: z.string(),
              merchants: z.array(z.string()),
              inventCredits: z.literal(false),
            }),
            flags: z.array(
              z.object({
                merchant: z.string(),
                broken: z.boolean(),
                reason: z.string(),
                setAt: z.string().datetime(),
              }),
            ),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      return {
        banner: buildParserBreakBanner(userId),
        flags: listParserBreakFlags(),
      };
    },
  );

  app.post(
    "/ingestion/parser-health/dismiss",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        body: z.object({ merchant: z.string().min(1).optional() }),
        response: {
          200: z.object({
            banner: z.object({
              visible: z.boolean(),
              title: z.string(),
              body: z.string(),
              manualAddLabel: z.string(),
              manualAddHref: z.string(),
              dismissLabel: z.string(),
              merchants: z.array(z.string()),
              inventCredits: z.literal(false),
            }),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = request.user!.sub;
      dismissParserBreakBanner(userId, request.body.merchant);
      return { banner: buildParserBreakBanner(userId) };
    },
  );

  /** Ops/test helper — set parser break flag (mirrors admin playbook). */
  app.post(
    "/ingestion/parser-health/flag",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["ingestion"],
        body: z.object({
          merchant: z.string().min(1),
          broken: z.boolean(),
          reason: z.string().optional(),
        }),
        response: {
          200: z.object({
            merchant: z.string(),
            broken: z.boolean(),
            reason: z.string(),
            setAt: z.string().datetime(),
          }),
          401: ErrorSchema,
        },
      },
    },
    async (request) => {
      const flag = setParserBreakFlag(request.body);
      audit(app.log, "parser.break.flagged", {
        userId: request.user!.sub,
        merchant: flag.merchant,
        broken: flag.broken,
      });
      return flag;
    },
  );
};
