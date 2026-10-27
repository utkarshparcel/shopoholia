import { Queue, Worker } from "bullmq";
import type { RedisOptions } from "ioredis";
import { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import type { Db } from "@worn/db";
import {
  consentGrants,
  ingestionDocuments,
  ingestionSources,
} from "@worn/db";
import {
  attachBullmqFailureReporting,
  initNodeSentry,
} from "@worn/shared/node-sentry";
import {
  INGEST_DEAD_LETTER_QUEUE,
  INGEST_JOB_NAME,
  INGEST_OAUTH_JOB_NAME,
  INGEST_QUEUE,
  INGEST_RESYNC_JOB_NAME,
} from "./queues.js";
import {
  enqueueDeadLetterJob,
  getBackoffDelay,
  recordFailure,
  recordSuccess,
  sendToDeadLetter,
} from "./dead-letter.js";
import { ConsoleMetricsSink } from "./parsers/metrics.js";
import { createDefaultRegistry } from "./parsers/index.js";
import type { MetricsSink, ParsedPurchase, RawEmailMessage } from "./parsers/types.js";
import type { EmailConnector } from "./connectors/types.js";
import {
  autofillCreditFromPurchase,
  createDbCreditAutofillRepos,
  type CreditAutofillRepos,
} from "./credit-autofill.js";
import { autofillEmiFromSignal, type EmiAutofillRepos } from "./emi-autofill.js";
import { detectEmiSignal } from "./parsers/emi-detect.js";
import {
  createDbPersister,
  smsToRawMessage,
  type IngestPersister,
  type IngestSourceKind,
} from "./persistence.js";
import { isMerchantMuted, mutedMerchantsFromMeta } from "./mute.js";
import { GmailConnector } from "./connectors/gmail.js";
import type { TokenStore } from "./connectors/types.js";
import type { AnalyticsEventName, AnalyticsProperties } from "@worn/shared";
import { createHttpAnalyticsSink } from "@worn/shared";

export {
  isMerchantMuted,
  mutedMerchantsFromMeta,
  normalizeMerchant,
} from "./mute.js";

export {
  INGEST_QUEUE,
  INGEST_DEAD_LETTER_QUEUE,
  INGEST_JOB_NAME,
  INGEST_RESYNC_JOB_NAME,
  INGEST_OAUTH_JOB_NAME,
};

/** True when the failure looks like missing/revoked OAuth credentials. */
export function isAuthOrTokenError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("no stored") ||
    msg.includes("failed to decrypt") ||
    msg.includes("invalid_grant") ||
    msg.includes("access token") ||
    msg.includes("refresh token") ||
    msg.includes("oauth") ||
    msg.includes("unauthorized") ||
    /(?:^|\D)401(?:\D|$)/.test(msg)
  );
}

/** Persist ERROR + lastError on the source so Closet health UI can reconnect. */
export async function markSourceAuthError(
  db: Db,
  sourceId: string,
  err: unknown,
): Promise<void> {
  const [existing] = await db
    .select({ meta: ingestionSources.meta })
    .from(ingestionSources)
    .where(eq(ingestionSources.id, sourceId))
    .limit(1);
  if (!existing) return;
  const prevMeta = (existing.meta ?? {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();
  const message = String(err).slice(0, 240);
  await db
    .update(ingestionSources)
    .set({
      status: "ERROR",
      meta: {
        ...prevMeta,
        lastError: message || "Auth failed — reconnect required",
        lastErrorAt: nowIso,
        errorCode: "AUTH_FAILED",
      },
      updatedAt: new Date(),
    })
    .where(eq(ingestionSources.id, sourceId));
}

// ---------------------------------------------------------------------------
// Job shapes
// ---------------------------------------------------------------------------

export type IngestJob =
  | { kind: "EMAIL"; message: RawEmailMessage; documentId?: string; sourceId?: string }
  | { kind: "SMS"; documentId: string; userId?: string }
  | { kind: "RESYNC"; sourceId: string };

/** Wire format produced by the API (`publishIngestJob`) and consumed here. */
export interface IngestJobData {
  kind?: "EMAIL" | "SMS";
  documentId?: string;
  userId?: string;
  message?: RawEmailMessage;
  sourceId?: string;
  payload?: unknown;
  code?: string;
}

export type IngestHandler = (job: IngestJob) => Promise<void>;

export interface IngestWorkerConsumer {
  start(): Promise<void>;
  stop(): Promise<void>;
  scheduleResync(sourceId: string, delayMs: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Core parse + persist pipeline
// ---------------------------------------------------------------------------

export interface ProcessIngestDeps {
  persister: IngestPersister;
  sourceKind: IngestSourceKind;
  documentId?: string;
  sourceId?: string;
  userId?: string;
  metrics?: MetricsSink;
  /** When set, gift-card / store-credit parses auto-deposit into money vault. */
  creditRepos?: CreditAutofillRepos;
  /** U007 — EMI due SMS → schedule plan. */
  emiRepos?: EmiAutofillRepos;
  /**
   * Merchants muted on the ingestion source (`meta.mutedMerchants`).
   * Matched parses for these merchants skip purchase/credit writes.
   */
  mutedMerchants?: readonly string[];
}

export interface ProcessIngestResult {
  matched: boolean;
  parserId?: string;
  purchaseId?: string;
  purchase?: ParsedPurchase;
  /** True when a parse matched but was skipped due to per-merchant mute. */
  skippedMuted?: boolean;
  creditAutofill?: {
    accountId: string;
    deposited: boolean;
    created: boolean;
  };
  emiAutofill?: {
    planId: string;
    created: boolean;
  };
}

/**
 * Runs a single normalized message through the parser framework and, on a
 * match, persists it via the {@link IngestPersister} (merchant_purchases +
 * items), marks the ingestion_document MATCHED/PARSED and advances the source
 * cursor. When a gift-card / store-credit signal is present and `userId` +
 * `creditRepos` are wired, also posts an idempotent DEPOSIT.
 * Always emits a coverage metric (per-run requirement).
 */
export async function processIngestJob(
  msg: RawEmailMessage,
  deps: ProcessIngestDeps,
): Promise<ProcessIngestResult> {
  const metrics = deps.metrics ?? new ConsoleMetricsSink();
  const registry = createDefaultRegistry(metrics);
  const result = registry.parse(msg);

  if (result.matched && result.purchase) {
    // N47: muted merchants never become purchases / credits — cursor still advances.
    if (isMerchantMuted(result.purchase.merchant, deps.mutedMerchants)) {
      if (deps.documentId) {
        await deps.persister.markDocument(deps.documentId, "UNMATCHED");
      }
      if (deps.sourceId) {
        await deps.persister.updateSourceCursor(deps.sourceId, msg.messageId);
      }
      return {
        matched: false,
        skippedMuted: true,
        parserId: result.parserId,
        purchase: result.purchase,
      };
    }

    const purchaseId = await deps.persister.insertPurchase(result.purchase, {
      sourceKind: deps.sourceKind,
      rawDocId: deps.documentId,
      userId: deps.userId,
    });
    if (deps.documentId) {
      await deps.persister.markDocument(deps.documentId, "MATCHED", purchaseId);
    }
    if (deps.sourceId) {
      await deps.persister.updateSourceCursor(deps.sourceId, msg.messageId);
    }

    let creditAutofill: ProcessIngestResult["creditAutofill"];
    if (deps.userId && deps.creditRepos && result.purchase.credit) {
      const filled = await autofillCreditFromPurchase(deps.creditRepos, {
        userId: deps.userId,
        purchase: result.purchase,
        documentId: deps.documentId,
      });
      if (filled) {
        creditAutofill = {
          accountId: filled.accountId,
          deposited: filled.deposited,
          created: filled.created,
        };
      }
    }

    const emiAutofill = await tryEmiAutofill(msg, deps);

    return {
      matched: true,
      parserId: result.parserId,
      purchaseId,
      purchase: result.purchase,
      ...(creditAutofill ? { creditAutofill } : {}),
      ...(emiAutofill ? { emiAutofill } : {}),
    };
  }

  const emiAutofill = await tryEmiAutofill(msg, deps);

  if (deps.documentId) {
    await deps.persister.markDocument(deps.documentId, "PARSED");
  }
  if (deps.sourceId) {
    await deps.persister.updateSourceCursor(deps.sourceId, msg.messageId);
  }
  return {
    matched: false,
    ...(emiAutofill ? { emiAutofill } : {}),
  };
}

async function tryEmiAutofill(
  msg: RawEmailMessage,
  deps: ProcessIngestDeps,
): Promise<ProcessIngestResult["emiAutofill"]> {
  if (!deps.userId || !deps.emiRepos) return undefined;
  const signal = detectEmiSignal(msg.subject, msg.text);
  if (!signal) return undefined;
  const filled = await autofillEmiFromSignal(deps.emiRepos, {
    userId: deps.userId,
    signal,
    documentId: deps.documentId,
  });
  if (!filled) return undefined;
  return { planId: filled.planId, created: filled.created };
}

/** Coverage-only processing (legacy B3 scaffold behaviour). */
export interface ProcessDeps {
  metrics?: MetricsSink;
}

export async function processEmail(
  msg: RawEmailMessage,
  deps: ProcessDeps = {},
): Promise<void> {
  const metrics = deps.metrics ?? new ConsoleMetricsSink();
  const registry = createDefaultRegistry(metrics);
  registry.parse(msg);
}

/** Parse + persist an SMS `ingestion_documents` row (B4). */
export async function processSmsDocument(
  doc: { id: string; parsedJson: Record<string, unknown> },
  persister: IngestPersister,
  metrics?: MetricsSink,
  opts: { userId?: string; creditRepos?: CreditAutofillRepos } = {},
): Promise<ProcessIngestResult> {
  const msg = smsToRawMessage(doc);
  return processIngestJob(msg, {
    persister,
    sourceKind: "SMS",
    documentId: doc.id,
    metrics,
    userId: opts.userId,
    creditRepos: opts.creditRepos,
  });
}

/** Loads an SMS document from the DB then runs {@link processSmsDocument}. */
export async function processSmsJob(
  db: Db,
  documentId: string,
  persister: IngestPersister,
  metrics?: MetricsSink,
  opts: { userId?: string; creditRepos?: CreditAutofillRepos } = {},
): Promise<ProcessIngestResult> {
  const [row] = await db
    .select()
    .from(ingestionDocuments)
    .where(eq(ingestionDocuments.id, documentId))
    .limit(1);
  if (!row) throw new Error(`ingestion document not found: ${documentId}`);
  return processSmsDocument(
    { id: row.id, parsedJson: (row.parsedJson ?? {}) as Record<string, unknown> },
    persister,
    metrics,
    opts,
  );
}

export interface ResyncDeps {
  db: Db;
  persister: IngestPersister;
  metrics?: MetricsSink;
  creditRepos?: CreditAutofillRepos;
  connectorFactory: (source: {
    id: string;
    provider: string;
    encryptedToken: unknown;
  }) => EmailConnector | null;
}

/**
 * Re-syncs a single ingestion source: loads its consent grant (refusing to
 * read without a live one), asks the connector for messages since its cursor,
 * persists each, and advances the cursor. Returns the number of messages seen.
 */
export async function processResync(
  sourceId: string,
  deps: ResyncDeps,
): Promise<number> {
  const [source] = await deps.db
    .select()
    .from(ingestionSources)
    .where(eq(ingestionSources.id, sourceId))
    .limit(1);
  if (!source) throw new Error(`ingestion source not found: ${sourceId}`);

  const [grant] = await deps.db
    .select()
    .from(consentGrants)
    .where(eq(consentGrants.id, source.consentGrantId))
    .limit(1);

  const connector = deps.connectorFactory({
    id: source.id,
    provider: source.provider,
    encryptedToken: source.encryptedToken,
  });
  if (!connector) return 0;

  const consent = {
    id: source.consentGrantId,
    revokedAt: grant ? grant.revokedAt : new Date(),
  };
  const { messages, nextCursor } = await connector.listSince(source.cursor, consent);
  const userId = grant?.userId;
  const mutedMerchants = mutedMerchantsFromMeta(
    (source.meta ?? null) as Record<string, unknown> | null,
  );

  for (const msg of messages) {
    await processIngestJob(msg, {
      persister: deps.persister,
      sourceKind: "EMAIL",
      sourceId: source.id,
      metrics: deps.metrics,
      userId,
      creditRepos: deps.creditRepos,
      mutedMerchants,
    });
  }

  if (nextCursor) {
    await deps.persister.updateSourceCursor(source.id, nextCursor);
  }
  return messages.length;
}

/** DB-backed {@link TokenStore} for a single ingestion source. */
export function createDbTokenStore(db: Db, sourceId: string): TokenStore {
  return {
    async load() {
      const [row] = await db
        .select({ et: ingestionSources.encryptedToken })
        .from(ingestionSources)
        .where(eq(ingestionSources.id, sourceId))
        .limit(1);
      return row?.et?.data ?? null;
    },
    async save(encrypted: string) {
      await db
        .update(ingestionSources)
        .set({ encryptedToken: { data: encrypted }, updatedAt: new Date() })
        .where(eq(ingestionSources.id, sourceId));
    },
  };
}

/** Builds a GmailConnector bound to a stored source (reads/writes encrypted
 * tokens via {@link createDbTokenStore}). */
export function createGmailConnectorForSource(
  db: Db,
  source: { id: string },
): GmailConnector {
  return new GmailConnector({
    clientId: process.env.GOOGLE_CLIENT_ID ?? "MISSING_GOOGLE_CLIENT_ID",
    // NOTE(B2 resolved): GOOGLE_CLIENT_SECRET is read from env for the live
    // token exchange in GmailConnector.completeOAuth. Full flow: API POST
    // /ingestion/sources builds OAuth URL with sourceId in state → callback
    // publishes oauth-complete job → worker calls completeOAuth which uses
    // this clientSecret and encrypts tokens via createDbTokenStore. Falls
    // back to "" (best-effort/mock) when no live creds are configured.
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: `${process.env.API_PUBLIC_URL ?? "https://api.shopoholia.app"}/ingestion/sources/oauth/callback`,
    sourceId: source.id,
    tokenStore: createDbTokenStore(db, source.id),
  });
}

// ---------------------------------------------------------------------------
// In-memory consumer (tests / local dev) — mirrors worker-orders scaffold
// ---------------------------------------------------------------------------

export interface MemoryIngestOptions {
  autoProcess?: boolean;
}

export function createMemoryIngestWorker(
  handler: IngestHandler,
  options: MemoryIngestOptions = {},
): IngestWorkerConsumer & {
  readonly queue: string;
  enqueue(job: IngestJob, delayMs?: number): Promise<void>;
  flush(): Promise<void>;
} {
  const autoProcess = options.autoProcess ?? true;
  const pending: Array<{ job: IngestJob; timer?: ReturnType<typeof setTimeout> }> = [];

  const enqueue = async (job: IngestJob, delayMs = 0): Promise<void> => {
    const entry: { job: IngestJob; timer?: ReturnType<typeof setTimeout> } = { job };
    pending.push(entry);
    if (!autoProcess) return;
    entry.timer = setTimeout(() => {
      void handler(job).catch(() => undefined);
    }, delayMs);
  };

  return {
    queue: INGEST_QUEUE,
    enqueue,
    async scheduleResync(sourceId: string, delayMs: number) {
      await enqueue({ kind: "RESYNC", sourceId }, delayMs);
    },
    async start() {},
    async stop() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      pending.length = 0;
    },
    async flush() {
      for (const entry of pending) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      for (const entry of pending) {
        await handler(entry.job);
      }
      pending.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// BullMQ consumer (production) — best-effort, requires Redis
// ---------------------------------------------------------------------------

export interface BullmqIngestOptions {
  db?: Db;
  redisUrl?: string;
  connection?: Redis;
  metrics?: MetricsSink;
  connectorFactory?: ResyncDeps["connectorFactory"];
  concurrency?: number;
}

export function createBullmqIngestWorker(
  options: BullmqIngestOptions = {},
): IngestWorkerConsumer & { readonly worker: Worker<IngestJobData> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error("REDIS_URL or an explicit connection is required for the BullMQ ingest worker");
  }
  const ownConnection = !options.connection;
  const connection: Redis | RedisOptions =
    options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  const persister = options.db ? createDbPersister(options.db) : null;
  const metrics = options.metrics ?? new ConsoleMetricsSink();
  const connectorFactory = options.connectorFactory ?? (() => null);

  const httpSink = createHttpAnalyticsSink({
    webhookUrl: process.env.ANALYTICS_WEBHOOK_URL,
    posthogKey: process.env.POSTHOG_KEY,
    posthogHost: process.env.POSTHOG_HOST,
  });
  const trackIngest = (
    name: AnalyticsEventName,
    properties?: AnalyticsProperties,
  ) => {
    try {
      if (httpSink) httpSink(name, properties);
      else if (process.env.NODE_ENV !== "test") {
        console.info("[analytics]", name, properties ?? {});
      }
    } catch {
      // best-effort
    }
  };
  const creditRepos = options.db
    ? createDbCreditAutofillRepos(options.db, trackIngest)
    : undefined;

  const resolveUserIdForSource = async (
    sourceId: string,
  ): Promise<string | undefined> => {
    if (!options.db) return undefined;
    const [source] = await options.db
      .select()
      .from(ingestionSources)
      .where(eq(ingestionSources.id, sourceId))
      .limit(1);
    if (!source) return undefined;
    const [grant] = await options.db
      .select({ userId: consentGrants.userId })
      .from(consentGrants)
      .where(eq(consentGrants.id, source.consentGrantId))
      .limit(1);
    return grant?.userId;
  };

  const resolveMutedMerchantsForSource = async (
    sourceId: string,
  ): Promise<string[]> => {
    if (!options.db) return [];
    const [source] = await options.db
      .select({ meta: ingestionSources.meta })
      .from(ingestionSources)
      .where(eq(ingestionSources.id, sourceId))
      .limit(1);
    return mutedMerchantsFromMeta(
      (source?.meta ?? null) as Record<string, unknown> | null,
    );
  };

  const resyncQueue = new Queue<IngestJobData>(INGEST_QUEUE, { connection });

  const worker = new Worker<IngestJobData>(
    INGEST_QUEUE,
    async (job) => {
      if (!options.db || !persister) return;
      const maxAttempts = (job.opts.attempts as number | undefined) ?? 3;
      const shouldDeadLetter = async (err: unknown) => {
        const attemptsMade = (job.attemptsMade ?? 0) + 1;
        if (attemptsMade < maxAttempts) return false;
        const sourceId = (job.data as { sourceId?: string }).sourceId;
        const documentId = (job.data as { documentId?: string }).documentId;
        const kind =
          job.name === INGEST_OAUTH_JOB_NAME
            ? "OAUTH"
            : job.name === INGEST_RESYNC_JOB_NAME
              ? "RESYNC"
              : (job.data as { kind?: string }).kind === "SMS"
                ? "SMS"
                : "EMAIL";
        const entry = sendToDeadLetter({
          kind: kind as never,
          sourceId,
          documentId,
          error: String(err),
          attempts: attemptsMade,
          payload: job.data,
        });
        void enqueueDeadLetterJob(entry);
        if (sourceId) recordFailure(sourceId);
        // Also mark document as ERROR if applicable
        if (documentId && options.db) {
          await options.db
            .update(ingestionDocuments)
            .set({ status: "ERROR", updatedAt: new Date() })
            .where(eq(ingestionDocuments.id, documentId))
            .catch(() => undefined);
        }
        // N49: persist source health when auth/token errors exhaust retries
        if (sourceId && options.db && isAuthOrTokenError(err)) {
          await markSourceAuthError(options.db, sourceId, err).catch(() => undefined);
        }
        return true;
      };

      try {
        if (job.name === INGEST_OAUTH_JOB_NAME) {
          const { sourceId, code } = job.data as { sourceId: string; code: string };
          const [source] = await options.db
            .select()
            .from(ingestionSources)
            .where(eq(ingestionSources.id, sourceId))
            .limit(1);
          if (!source) return;
          const [grant] = await options.db
            .select()
            .from(consentGrants)
            .where(eq(consentGrants.id, source.consentGrantId))
            .limit(1);
          const connector = createGmailConnectorForSource(options.db, {
            id: source.id,
          });
          await connector.completeOAuth(code, {
            id: source.consentGrantId,
            revokedAt: grant?.revokedAt ?? new Date(),
          });
          if (sourceId) recordSuccess(sourceId);
          return;
        }

        if (job.name === INGEST_RESYNC_JOB_NAME) {
          const { sourceId } = job.data as { sourceId: string };
          // Respect per-source backoff — if still in backoff window, re-schedule with delay
          const backoffDelay = sourceId ? getBackoffDelay(sourceId) : 0;
          if (backoffDelay > 0) {
            throw new Error(`Backoff active for source ${sourceId}: retry in ${backoffDelay}ms`);
          }
          await processResync(sourceId, {
            db: options.db,
            persister,
            metrics,
            creditRepos,
            connectorFactory,
          });
          if (sourceId) recordSuccess(sourceId);
          return;
        }

        const data = job.data;
        if (data.kind === "SMS") {
          if (data.documentId) {
            await processSmsJob(options.db, data.documentId, persister, metrics, {
              userId: data.userId,
              creditRepos,
            });
            if (data.sourceId) recordSuccess(data.sourceId);
          }
          return;
        }

        // EMAIL
        if (data.message) {
          const userId =
            data.userId ??
            (data.sourceId ? await resolveUserIdForSource(data.sourceId) : undefined);
          const mutedMerchants = data.sourceId
            ? await resolveMutedMerchantsForSource(data.sourceId)
            : [];
          await processIngestJob(data.message, {
            persister,
            sourceKind: "EMAIL",
            documentId: data.documentId,
            sourceId: data.sourceId,
            metrics,
            userId,
            creditRepos,
            mutedMerchants,
          });
          if (data.sourceId) recordSuccess(data.sourceId);
        } else if (data.sourceId) {
          const backoffDelay = getBackoffDelay(data.sourceId);
          if (backoffDelay > 0) {
            throw new Error(`Backoff active for source ${data.sourceId}: retry in ${backoffDelay}ms`);
          }
          await processResync(data.sourceId, {
            db: options.db,
            persister,
            metrics,
            creditRepos,
            connectorFactory,
          });
          recordSuccess(data.sourceId);
        }
      } catch (err) {
        const dead = await shouldDeadLetter(err);
        if (!dead) {
          // Record failure but allow BullMQ retry with backoff
          const sid = (job.data as { sourceId?: string }).sourceId;
          if (sid) recordFailure(sid);
        }
        throw err;
      }
    },
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env.INGEST_CONCURRENCY ?? 4),
    },
  );

  initNodeSentry({ worker: "ingest" });
  attachBullmqFailureReporting(worker, "ingest");

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(
        `[worker-ingest] BullMQ worker ready on queue "${INGEST_QUEUE}" (jobs "${INGEST_JOB_NAME}", "${INGEST_RESYNC_JOB_NAME}")`,
      );
    },
    async stop() {
      await worker.close();
      await resyncQueue.close().catch(() => undefined);
      if (ownConnection && connection instanceof Redis) {
        await connection.quit().catch(() => undefined);
      }
    },
    async scheduleResync(sourceId: string, delayMs: number) {
      const backoffExtra = getBackoffDelay(sourceId);
      const effectiveDelay = delayMs + backoffExtra;
      await resyncQueue.add(
        INGEST_RESYNC_JOB_NAME,
        { sourceId },
        {
          delay: effectiveDelay,
          jobId: `resync:${sourceId}:${Date.now()}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        },
      );
    },
  };
}
