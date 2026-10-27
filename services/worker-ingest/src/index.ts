import { createHash } from "node:crypto";
import { DelayedError, Queue, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@worn/db";
import {
  consentGrants,
  ingestionDocuments,
  ingestionSources,
} from "@worn/db";
import {
  captureNodeException,
  initNodeSentry,
} from "@worn/shared/node-sentry";
import {
  DEFAULT_JOB_ATTEMPTS,
  DEFAULT_JOB_BACKOFF,
  DeferJobError,
  JOB_REMOVE_ON_COMPLETE,
  JOB_REMOVE_ON_FAIL,
  attachStalledDeadLetters,
  createJobProcessor,
  deadLetterAlert,
  deferJob,
  isFinalAttempt,
  jobIdFrom,
  type DeadLetter,
  type IngestDeadLetterJob,
  type ProcessableJob,
} from "@worn/shared";
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
  toIngestDeadLetter,
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
  // A rerun of a job that already got this far: the document has its result, don't write it twice.
  if (row.status === "PARSED" || row.status === "MATCHED" || row.status === "UNMATCHED") {
    return {
      matched: row.status === "MATCHED",
      ...(row.matchedPurchaseId ? { purchaseId: row.matchedPurchaseId } : {}),
    };
  }
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
  if (!connector) {
    throw new UnrecoverableError(`no email connector for provider "${source.provider}"`);
  }

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
 * tokens via {@link createDbTokenStore} unless `tokenStore` is given). */
export function createGmailConnectorForSource(
  db: Db,
  source: { id: string },
  tokenStore: TokenStore = createDbTokenStore(db, source.id),
): GmailConnector {
  // NOTE(B2 resolved): API POST /ingestion/sources builds the OAuth URL with sourceId in state →
  // callback publishes the oauth-complete job → the worker calls completeOAuth with these
  // credentials and stores the tokens encrypted.
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    // No retry can fix configuration, so the job dead-letters at once with this reason.
    throw new UnrecoverableError(
      "Gmail is not configured on this worker: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required",
    );
  }
  return new GmailConnector({
    clientId,
    clientSecret,
    redirectUri: `${process.env.API_PUBLIC_URL ?? "https://api.shopoholia.app"}/ingestion/sources/oauth/callback`,
    sourceId: source.id,
    tokenStore,
  });
}

/** The connector for a stored source. Gmail is the only email provider so far. */
export function createDefaultConnectorFactory(db: Db): ResyncDeps["connectorFactory"] {
  return (source) =>
    source.provider.toLowerCase() === "gmail" ? createGmailConnectorForSource(db, source) : null;
}

/** Same short hash of the code as the API's oauth job id, so a rerun can tell it was used. */
function oauthCodeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex").slice(0, 16);
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
// BullMQ consumer (production) — requires Redis and a Db
// ---------------------------------------------------------------------------

/** Ingest jobs carry message text: finished ones are kept briefly (the dead letter keeps the ids). */
const INGEST_REMOVE_ON_COMPLETE = { age: 86_400, count: 10_000 } as const;
const INGEST_REMOVE_ON_FAIL = { age: 7 * 86_400 } as const;
/** A resync lists and parses a whole page of mail, so it gets longer than the default. */
const INGEST_JOB_TIMEOUT_MS = 5 * 60_000;

export interface BullmqIngestOptions {
  db?: Db | null;
  redisUrl?: string;
  connection?: Redis;
  metrics?: MetricsSink;
  connectorFactory?: ResyncDeps["connectorFactory"];
  /** Where final failures go; defaults to the ingest-dead-letter queue (ids only). */
  recordDeadLetter?: (entry: DeadLetter) => Promise<void>;
  concurrency?: number;
}

export function createBullmqIngestWorker(
  options: BullmqIngestOptions = {},
): IngestWorkerConsumer & { readonly worker: Worker<IngestJobData> } {
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL;
  if (!redisUrl && !options.connection) {
    throw new Error("REDIS_URL or an explicit connection is required for the BullMQ ingest worker");
  }
  const db = options.db ?? null;
  // Without a Db every job would complete having done nothing: refuse to start instead.
  if (!db) throw new Error("A Db is required for worker-ingest");
  const ownConnection = !options.connection;
  const connection = options.connection ?? new Redis(redisUrl as string, { maxRetriesPerRequest: null });

  const persister = createDbPersister(db);
  const metrics = options.metrics ?? new ConsoleMetricsSink();
  const connectorFactory = options.connectorFactory ?? createDefaultConnectorFactory(db);

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
  const creditRepos = createDbCreditAutofillRepos(db, trackIngest);

  const resolveUserIdForSource = async (
    sourceId: string,
  ): Promise<string | undefined> => {
    const [source] = await db
      .select()
      .from(ingestionSources)
      .where(eq(ingestionSources.id, sourceId))
      .limit(1);
    if (!source) return undefined;
    const [grant] = await db
      .select({ userId: consentGrants.userId })
      .from(consentGrants)
      .where(eq(consentGrants.id, source.consentGrantId))
      .limit(1);
    return grant?.userId;
  };

  const resolveMutedMerchantsForSource = async (
    sourceId: string,
  ): Promise<string[]> => {
    const [source] = await db
      .select({ meta: ingestionSources.meta })
      .from(ingestionSources)
      .where(eq(ingestionSources.id, sourceId))
      .limit(1);
    return mutedMerchantsFromMeta(
      (source?.meta ?? null) as Record<string, unknown> | null,
    );
  };

  const resyncQueue = new Queue<IngestJobData>(INGEST_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: DEFAULT_JOB_ATTEMPTS,
      backoff: DEFAULT_JOB_BACKOFF,
      removeOnComplete: INGEST_REMOVE_ON_COMPLETE,
      removeOnFail: INGEST_REMOVE_ON_FAIL,
    },
  });
  const deadLetterQueue = new Queue<IngestDeadLetterJob>(INGEST_DEAD_LETTER_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: DEFAULT_JOB_ATTEMPTS,
      backoff: DEFAULT_JOB_BACKOFF,
      removeOnComplete: JOB_REMOVE_ON_COMPLETE,
      removeOnFail: JOB_REMOVE_ON_FAIL,
    },
  });
  const recordDeadLetter =
    options.recordDeadLetter ??
    ((entry: DeadLetter) => enqueueDeadLetterJob(deadLetterQueue, toIngestDeadLetter(entry)));

  initNodeSentry({ worker: "ingest" });
  const onDeadLetter = deadLetterAlert((err, tags) => captureNodeException(err, { worker: "ingest", ...tags }));

  const resync = async (sourceId: string) => {
    // Wait out the source's backoff without spending an attempt.
    const backoffDelay = getBackoffDelay(sourceId);
    if (backoffDelay > 0) deferJob(backoffDelay);
    await processResync(sourceId, { db, persister, metrics, creditRepos, connectorFactory });
    recordSuccess(sourceId);
  };

  const completeOAuth = async (sourceId: string, code: string) => {
    const [source] = await db
      .select()
      .from(ingestionSources)
      .where(eq(ingestionSources.id, sourceId))
      .limit(1);
    if (!source) return; // disconnected since
    const codeHash = oauthCodeHash(code);
    // A rerun after the exchange worked: the code is spent, and trying it again would fail.
    if ((source.meta as Record<string, unknown> | null)?.oauthCodeHash === codeHash) return;
    const [grant] = await db
      .select()
      .from(consentGrants)
      .where(eq(consentGrants.id, source.consentGrantId))
      .limit(1);
    const tokens = createDbTokenStore(db, source.id);
    const connector = createGmailConnectorForSource(db, { id: source.id }, {
      load: tokens.load,
      // The tokens and the spent code's hash land in one write.
      async save(encrypted: string) {
        await db
          .update(ingestionSources)
          .set({
            encryptedToken: { data: encrypted },
            meta: sql`coalesce(${ingestionSources.meta}, '{}'::jsonb) || ${JSON.stringify({ oauthCodeHash: codeHash })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(ingestionSources.id, source.id));
      },
    });
    await connector.completeOAuth(code, {
      id: source.consentGrantId,
      revokedAt: grant?.revokedAt ?? new Date(),
    });
    recordSuccess(sourceId);
  };

  const run = async (name: string, data: IngestJobData): Promise<void> => {
    if (name === INGEST_OAUTH_JOB_NAME) {
      if (!data.sourceId || !data.code) throw new UnrecoverableError("oauth job needs sourceId and code");
      await completeOAuth(data.sourceId, data.code);
      return;
    }
    if (name === INGEST_RESYNC_JOB_NAME) {
      if (!data.sourceId) throw new UnrecoverableError("resync job has no sourceId");
      await resync(data.sourceId);
      return;
    }
    if (name !== INGEST_JOB_NAME) throw new UnrecoverableError(`unknown ${INGEST_QUEUE} job "${name}"`);

    if (data.kind === "SMS") {
      if (!data.documentId) throw new UnrecoverableError("SMS ingest job has no documentId");
      await processSmsJob(db, data.documentId, persister, metrics, {
        userId: data.userId,
        creditRepos,
      });
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
      return;
    }
    if (data.sourceId) {
      await resync(data.sourceId);
      return;
    }
    // e.g. the email webhook's raw provider body: nothing maps it to a message, user or source yet.
    throw new UnrecoverableError("email ingest job has no message or source to process");
  };

  /** What a job that failed for good leaves behind for the Closet health UI. */
  const onFinalFailure = async (data: IngestJobData, err: unknown) => {
    if (data.documentId) {
      await db
        .update(ingestionDocuments)
        .set({ status: "ERROR", updatedAt: new Date() })
        .where(eq(ingestionDocuments.id, data.documentId))
        .catch((e: unknown) => console.error("[worker-ingest] could not mark the document ERROR:", String(e)));
    }
    // N49: persist source health when auth/token errors exhaust retries
    if (data.sourceId && isAuthOrTokenError(err)) {
      await markSourceAuthError(db, data.sourceId, err).catch((e: unknown) =>
        console.error("[worker-ingest] could not record the source's auth error:", String(e)),
      );
    }
  };

  const handle = async (data: IngestJobData, job: ProcessableJob) => {
    try {
      await run(job.name, data);
    } catch (err) {
      if (err instanceof DeferJobError) throw err;
      if (data.sourceId) recordFailure(data.sourceId);
      if (isFinalAttempt(job, err)) await onFinalFailure(data, err);
      throw err;
    }
  };

  const worker = new Worker<IngestJobData>(
    INGEST_QUEUE,
    createJobProcessor<IngestJobData>({
      queue: INGEST_QUEUE,
      handle,
      timeoutMs: INGEST_JOB_TIMEOUT_MS,
      recordDeadLetter,
      onDeadLetter,
      errors: { DelayedError, UnrecoverableError },
    }),
    {
      connection,
      concurrency: options.concurrency ?? Number(process.env.INGEST_CONCURRENCY ?? 4),
      removeOnComplete: INGEST_REMOVE_ON_COMPLETE,
      removeOnFail: INGEST_REMOVE_ON_FAIL,
    },
  );
  worker.on("error", (err) => console.error(`[worker-ingest] ${INGEST_QUEUE} worker error:`, err.message));
  attachStalledDeadLetters(worker, { queue: INGEST_QUEUE, recordDeadLetter, onDeadLetter });

  return {
    worker,
    async start() {
      await worker.waitUntilReady();
      console.info(
        `[worker-ingest] BullMQ worker ready on queue "${INGEST_QUEUE}" (jobs "${INGEST_JOB_NAME}", "${INGEST_RESYNC_JOB_NAME}", "${INGEST_OAUTH_JOB_NAME}")`,
      );
    },
    async stop() {
      await worker.close();
      await resyncQueue.close();
      await deadLetterQueue.close();
      if (ownConnection) await connection.quit().catch(() => undefined);
    },
    async scheduleResync(sourceId: string, delayMs: number) {
      const effectiveDelay = delayMs + getBackoffDelay(sourceId);
      // One resync per source per minute of run time, however often it is asked for.
      const runMinute = Math.floor((Date.now() + effectiveDelay) / 60_000);
      await resyncQueue.add(
        INGEST_RESYNC_JOB_NAME,
        { sourceId },
        { delay: effectiveDelay, jobId: jobIdFrom("resync", sourceId, runMinute) },
      );
    },
  };
}
