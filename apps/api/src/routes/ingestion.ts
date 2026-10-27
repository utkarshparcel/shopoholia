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
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
import type { Repositories } from "../lib/repositories/types.js";
import { enqueueGmailTokenRevoke } from "../jobs/gmail-token-revoke.js";
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
// purgeExpiredIngestionDocuments after PARSED/MATCHED/UNMATCHED. R2 encrypts
// every object at rest with AES-256 (R2 takes no per-request SSE setting) and
// tokens are AES-256-GCM encrypted at rest (see services/worker-ingest/src/crypto.ts).

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

function gmailRedirectUri(): string {
  const base = process.env.API_PUBLIC_URL ?? "https://api.shopoholia.app";
  return `${base.replace(/\/$/, "")}/ingestion/sources/oauth/callback`;
}

// ---------------------------------------------------------------------------
// OAuth state: base64url(JSON {v: 2, userId, sourceId, kind, nonce, exp}) + "." + HMAC-SHA256.
//  1. POST /ingestion/sources (auth required) stores the nonce (oauth_states, 10 minutes) and
//     returns the Google consent URL with the signed state.
//  2. Google redirects the browser to GET /ingestion/sources/oauth/callback?code=&state=.
//  3. The callback checks the signature and expiry, then consumes the nonce, so each state works
//     once and only for the user and source it was made for. Unsigned or older states are refused.
//     The worker exchanges the code for tokens (encrypted at rest). A browser gets a page that
//     sends it back to the app, never JSON.
// ---------------------------------------------------------------------------

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** HMAC key for the state. In production only OAUTH_STATE_SECRET counts: there is no fallback. */
export function oauthStateSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.OAUTH_STATE_SECRET) return env.OAUTH_STATE_SECRET;
  if (env.NODE_ENV === "production") return null;
  return env.JWT_ACCESS_SECRET ?? "dev-only-change-me";
}

/** Gmail connect needs a client id and a state secret; in production neither has a stand-in. */
export function gmailConnectAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || Boolean(env.GOOGLE_CLIENT_ID && env.OAUTH_STATE_SECRET);
}

export type OauthStatePayload = {
  v: 2;
  userId: string;
  sourceId: string;
  kind: string;
  nonce: string;
  /** Expiry, epoch ms. */
  exp: number;
};

function stateSignature(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function signState(payload: Omit<OauthStatePayload, "v">): string {
  const secret = oauthStateSecret();
  if (!secret) throw new Error("OAUTH_STATE_SECRET is not set");
  const body = Buffer.from(JSON.stringify({ v: 2, ...payload })).toString("base64url");
  return `${body}.${stateSignature(body, secret).toString("base64url")}`;
}

/** The payload of a state this server signed and that has not expired; null for anything else. */
export function verifyState(state: string, now = Date.now()): OauthStatePayload | null {
  const secret = oauthStateSecret();
  const parts = state.split(".");
  if (!secret || parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const given = Buffer.from(sig, "base64url");
  const expected = stateSignature(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<OauthStatePayload>;
    if (
      payload.v !== 2 ||
      typeof payload.userId !== "string" ||
      typeof payload.sourceId !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= now
    ) {
      return null;
    }
    return payload as OauthStatePayload;
  } catch {
    return null;
  }
}

/** Stores a single-use nonce for this user and source and returns the signed state that carries it. */
export async function createOauthState(
  repos: { saveOauthState(record: { nonce: string; userId: string; sourceId: string; expiresAt: Date }): Promise<void> },
  userId: string,
  sourceId: string,
): Promise<string> {
  const nonce = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  await repos.saveOauthState({ nonce, userId, sourceId, expiresAt });
  return signState({ userId, sourceId, kind: "EMAIL", nonce, exp: expiresAt.getTime() });
}

/** Where the callback page sends the user: the app's email-connect screen. */
const APP_RETURN_URL = "worn://connect-email";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The page a browser sees at the end of the OAuth redirect. */
function oauthResultPage(title: string, message: string, appUrl: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:48px 24px;text-align:center;color:#1b1b1b;background:#faf8f5}a{display:inline-block;margin-top:24px;padding:14px 28px;border-radius:999px;background:#1b1b1b;color:#fff;text-decoration:none}</style>
</head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="${escapeHtml(appUrl)}">Back to Worn</a></body></html>`;
}

function buildGmailOauthUrl(state: string): string {
  // Only outside production: gmailConnectAvailable() keeps production from reaching this without one.
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "MISSING_GOOGLE_CLIENT_ID";
  // The worker (services/worker-ingest GmailConnector.completeOAuth) exchanges the code for tokens
  // with GOOGLE_CLIENT_SECRET and stores them encrypted.
  const redirectUri = gmailRedirectUri();
  const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly");
  // NOTE(B2 resolved): OAuth URL → callback → encrypted token store. See
  // services/worker-ingest/src/connectors/gmail.ts completeOAuth and
  // services/worker-ingest/src/index.ts createGmailConnectorForSource.
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri,
  )}&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${encodeURIComponent(state)}`;
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

/** The caller's document, or null: another user's document reads as missing. */
async function findOwnedDocument(repos: Repositories, userId: string, documentId: string) {
  const doc = await repos.getIngestionDocumentById(documentId);
  if (!doc) return null;
  if (doc.userId) return doc.userId === userId ? doc : null;
  // Rows from before the owner column (not yet backfilled) use the repo's legacy owner rules.
  const legacy = await repos.listIngestionDocumentsByUser(userId);
  return legacy.some((d) => d.id === documentId) ? doc : null;
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const ingestionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/ingestion/sources",
    {
      // EMAIL consent is checked in the handler (403), after the provider availability check,
      // so an unavailable connect answers 503 whatever the caller's consent.
      preHandler: requireAuth,
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
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const { kind, provider } = request.body;

      if (!gmailConnectAvailable()) {
        request.log.error("Gmail connect is unavailable: GOOGLE_CLIENT_ID or OAUTH_STATE_SECRET is not set");
        return reply.code(503).send({ error: "Unavailable", message: "Email connect is unavailable" });
      }

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

      const oauthUrl = buildGmailOauthUrl(await createOauthState(app.deps.repos, userId, source.id));
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
          503: ErrorSchema,
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

      // Queued before the token is cleared: a queue outage (503) leaves the source connected
      // so the user can retry, instead of dropping a token Google still honours.
      if (source.kind === "EMAIL" && source.encryptedToken?.data) {
        await enqueueGmailTokenRevoke(source.id, source.encryptedToken.data);
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

  // Gmail OAuth redirect target. The browser arrives here from Google with no session: the signed,
  // single-use state is the credential (see signState/verifyState above). The worker owns the token
  // exchange and encryption at rest, so the API never handles plaintext tokens. A browser
  // (Accept: text/html) gets a page that leads back to the app; other callers get JSON.
  app.get(
    "/ingestion/sources/oauth/callback",
    {
      schema: {
        tags: ["ingestion"],
        querystring: z.object({
          code: z.string().min(1).optional(),
          // Set by Google when the user cancels or the grant fails.
          error: z.string().optional(),
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
      const wantsPage = (request.headers.accept ?? "").includes("text/html");
      const page = (status: number, title: string, message: string, appUrl: string) =>
        reply
          .code(status as 202)
          .type("text/html; charset=utf-8")
          .header("cache-control", "no-store")
          .send(oauthResultPage(title, message, appUrl) as never);
      const fail = (status: 400 | 403 | 404, error: string, message: string) =>
        wantsPage
          ? page(
              status,
              "Gmail isn't connected",
              "This link didn't work or has already been used. Go back to Worn and try connecting Gmail again.",
              `${APP_RETURN_URL}?status=failed`,
            )
          : reply.code(status).send({ error, message });

      const statePayload = verifyState(request.query.state);
      if (!statePayload) return fail(400, "Bad Request", "Invalid state");
      // Single use, and only for the user and source it was issued for.
      const stored = await app.deps.repos.consumeOauthState(statePayload.nonce);
      if (!stored || stored.userId !== statePayload.userId || stored.sourceId !== statePayload.sourceId) {
        return fail(400, "Bad Request", "Invalid state");
      }

      // If the request also carries a valid JWT, it must be the state's user.
      try {
        await request.jwtVerify<{ sub: string }>();
        const authed = (request as unknown as { user: { sub: string } }).user?.sub;
        if (authed && authed !== statePayload.userId) {
          return fail(403, "Forbidden", "State mismatch");
        }
      } catch {
        // No JWT: the state is enough.
      }

      const userId = statePayload.userId;

      const source = await app.deps.repos.getIngestionSourceById(statePayload.sourceId);
      if (!source) {
        return fail(404, "Not Found", "Source not found");
      }

      // Bind OAuth completion to the source's consent grant — revoke/re-grant
      // issues a new grant id, so stale sources cannot complete OAuth.
      const activeConsents = await app.deps.repos.listActiveConsents(userId);
      if (!activeConsents.some((g) => g.id === source.consentGrantId)) {
        return fail(403, "Forbidden", "Source consent grant is not active");
      }

      const code = request.query.code;
      if (request.query.error || !code) {
        request.log.info({ sourceId: source.id }, "ingestion.oauth.declined");
        return wantsPage
          ? page(
              400,
              "Gmail isn't connected",
              "Google didn't give Worn access. Go back to Worn to try again.",
              `${APP_RETURN_URL}?status=cancelled`,
            )
          : reply.code(400).send({ error: "Bad Request", message: "Google did not grant access" });
      }

      const status = await publishOauthCompleteJob({
        sourceId: source.id,
        code,
        userId,
      });
      if (status === "skipped") {
        app.log.warn(
          { sourceId: source.id },
          "ingestion.oauth.enqueue.skipped: no Redis configured",
        );
      }

      audit(app.log, "ingestion.oauth.initiated", { userId, sourceId: source.id });
      if (wantsPage) {
        return page(
          202,
          "Connecting Gmail",
          "Google gave Worn access. Go back to Worn to see your Gmail connection finish.",
          `${APP_RETURN_URL}?status=connecting&sourceId=${encodeURIComponent(source.id)}`,
        );
      }
      return reply
        .code(202)
        .send({ status: "pending", sourceId: source.id });
    },
  );

  async function listActivityForUser(
    userId: string,
    opts: { kind?: "EMAIL" | "SMS" | "RECEIPT"; limit: number },
  ) {
    const docs = await app.deps.repos.listIngestionDocumentsByUser(userId, opts);
    const purchaseIds = docs
      .map((d) => d.matchedPurchaseId)
      .filter((id): id is string => Boolean(id));
    // Only the caller's own purchases are joined in.
    const purchaseMap = new Map(
      (await app.deps.repos.findMerchantPurchasesByIds(purchaseIds))
        .filter((p) => p.userId === userId)
        .map((p) => [p.id, p] as const),
    );

    const items = docs.map((doc) =>
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
      const result = await listActivityForUser(userId, { limit: request.query.limit ?? 50 });
      trackServerEvent("ingestion_activity_viewed", {
        userId,
        count: result.items.length,
      });
      return result;
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
      const result = await listActivityForUser(userId, { kind: source.kind, limit: 50 });
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
      const doc = await findOwnedDocument(app.deps.repos, userId, docId);
      if (!doc) {
        return reply.code(404).send({ error: "Not Found", message: "Document not found" });
      }

      const prev = doc.parsedJson ?? {};
      const nextParsed: Record<string, unknown> = {
        ...prev,
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
          alias: z.string().min(1).max(200),
          canonical: z.string().min(1).max(200),
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
        const doc = await findOwnedDocument(app.deps.repos, userId, documentId);
        if (!doc) {
          return reply.code(404).send({ error: "Not Found", message: "Document not found" });
        }
        const nextParsed = {
          ...(doc.parsedJson ?? {}),
          merchant: row.canonical,
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
          pattern: z.string().min(1).max(200),
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
          pattern: z.string().min(1).max(200),
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
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.sub;
      const docId = request.params.id;
      if (!request.body.confirm) {
        return reply.code(400).send({ error: "Bad Request", message: "confirm required" });
      }
      const doc = await findOwnedDocument(app.deps.repos, userId, docId);
      if (!doc) {
        return reply.code(404).send({ error: "Not Found", message: "Document not found" });
      }
      const before = computeRetentionCountdown(doc);
      if (doc.rawKey) {
        try {
          await app.deps.storage.delete(doc.rawKey);
        } catch (err) {
          request.log.error({ err, documentId: docId }, "ingestion.raw_delete_failed");
          return reply.code(503).send({
            error: "Service Unavailable",
            message: "The raw copy could not be deleted. Try again.",
          });
        }
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
        body: z.object({ merchant: z.string().min(1).max(100).optional() }),
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

  /**
   * Ops/test helper — set parser break flag (mirrors admin playbook). The flag shows a banner to
   * every user, so in production it needs X-Admin-Secret (fails closed without ADMIN_SECRET).
   */
  app.post(
    "/ingestion/parser-health/flag",
    {
      preHandler: [
        requireAuth,
        async (request, reply) => {
          if (process.env.NODE_ENV !== "production") return;
          const expected = process.env.ADMIN_SECRET;
          const provided = request.headers["x-admin-secret"];
          if (!expected || typeof provided !== "string" || !secretsEqual(provided, expected)) {
            return reply.code(403).send({ error: "Forbidden", message: "Ops only" });
          }
        },
      ],
      schema: {
        tags: ["ingestion"],
        body: z.object({
          merchant: z.string().min(1).max(100),
          broken: z.boolean(),
          reason: z.string().max(500).optional(),
        }),
        response: {
          200: z.object({
            merchant: z.string(),
            broken: z.boolean(),
            reason: z.string(),
            setAt: z.string().datetime(),
          }),
          401: ErrorSchema,
          403: ErrorSchema,
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
