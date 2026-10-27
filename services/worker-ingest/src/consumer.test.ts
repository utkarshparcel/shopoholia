import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { IngestDeadLetterJobSchema, jobIdFrom } from "@worn/shared";
import { consentGrants, ingestionDocuments, ingestionSources, type Db } from "@worn/db";
import {
  createBullmqIngestWorker,
  createDefaultConnectorFactory,
  createGmailConnectorForSource,
  createMemoryIngestWorker,
  INGEST_DEAD_LETTER_QUEUE,
  INGEST_JOB_NAME,
  INGEST_OAUTH_JOB_NAME,
  INGEST_QUEUE,
  INGEST_RESYNC_JOB_NAME,
  processResync,
  processSmsJob,
  type IngestJob,
  type IngestJobData,
  type IngestPersister,
} from "./index.js";
import { clearBackoff, recordFailure } from "./dead-letter.js";

const SOURCE_ID = "00000000-0000-4000-8000-00000000s001";

/** A Db stand-in routed by table; updates are recorded. */
function mockDb(rows: {
  source?: Record<string, unknown>;
  grant?: Record<string, unknown>;
  doc?: Record<string, unknown>;
} = {}) {
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === ingestionSources) return rows.source ? [rows.source] : [];
            if (table === consentGrants) return rows.grant ? [rows.grant] : [];
            if (table === ingestionDocuments) return rows.doc ? [rows.doc] : [];
            return [];
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push({ table, values });
        },
      }),
    }),
    updates,
  };
  return db as unknown as Db & { updates: typeof updates };
}

function fakePersister() {
  const insert = vi.fn(async () => "pid-1");
  const persister: IngestPersister = {
    insertPurchase: insert,
    markDocument: vi.fn(async () => undefined),
    updateSourceCursor: vi.fn(async () => undefined),
  };
  return { persister, insert };
}

describe("worker-ingest consumer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearBackoff();
  });

  it("registers the ingest queue name", () => {
    expect(INGEST_QUEUE).toBe("ingest-email");
  });

  it("runs in-memory jobs and is wired to the queue", async () => {
    const handler = vi.fn(async () => undefined);
    const worker = createMemoryIngestWorker(handler, { autoProcess: false });
    expect(worker.queue).toBe(INGEST_QUEUE);

    const job: IngestJob = {
      kind: "EMAIL",
      message: {
        messageId: "m1",
        from: "no-reply@amazon.in",
        to: "me@example.com",
        subject: "Your Amazon.in order",
        text: "Order #A1B2C3 total ₹1,299.00",
        receivedAt: new Date(0).toISOString(),
      },
    };

    await worker.start();
    await worker.enqueue(job, 0);
    await worker.flush();
    expect(handler).toHaveBeenCalledWith(job);
    await worker.stop();
  });

  it("refuses to build a BullMQ worker without Redis or without a Db", () => {
    vi.stubEnv("REDIS_URL", "");
    expect(() => createBullmqIngestWorker()).toThrow(/REDIS_URL/);
    expect(() => createBullmqIngestWorker({ redisUrl: "redis://127.0.0.1:1" })).toThrow(/Db is required/);
  });

  it("does not parse an SMS document a second time", async () => {
    const { persister, insert } = fakePersister();
    const db = mockDb({ doc: { id: "doc-1", status: "MATCHED", matchedPurchaseId: "pid-0", parsedJson: {} } });
    await expect(processSmsJob(db, "doc-1", persister)).resolves.toEqual({ matched: true, purchaseId: "pid-0" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("fails a resync for a provider it has no connector for instead of reporting zero mail", async () => {
    const { persister } = fakePersister();
    const db = mockDb({
      source: { id: SOURCE_ID, provider: "outlook", consentGrantId: "g-1", cursor: null, encryptedToken: null, meta: {} },
      grant: { id: "g-1", revokedAt: null },
    });
    await expect(
      processResync(SOURCE_ID, { db, persister, connectorFactory: createDefaultConnectorFactory(db) }),
    ).rejects.toMatchObject({ name: "UnrecoverableError", message: 'no email connector for provider "outlook"' });
  });

  it("refuses to build a Gmail connector without Google credentials", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(() => createGmailConnectorForSource(mockDb(), { id: SOURCE_ID })).toThrow(/Gmail is not configured/);
  });

  describe.skipIf(!process.env.TEST_REDIS_URL)("on a real Redis", () => {
    async function withWorker(
      db: Db,
      run: (ctx: {
        consumer: ReturnType<typeof createBullmqIngestWorker>;
        queue: Queue<IngestJobData>;
        deadLetters: Queue;
      }) => Promise<void>,
    ) {
      const connection = new Redis(process.env.TEST_REDIS_URL!, { maxRetriesPerRequest: null });
      const queue = new Queue<IngestJobData>(INGEST_QUEUE, { connection });
      const deadLetters = new Queue(INGEST_DEAD_LETTER_QUEUE, { connection });
      await queue.obliterate({ force: true });
      await deadLetters.obliterate({ force: true });
      const consumer = createBullmqIngestWorker({ connection, db });
      try {
        await consumer.start();
        await run({ consumer, queue, deadLetters });
      } finally {
        await consumer.stop();
        await queue.obliterate({ force: true });
        await deadLetters.obliterate({ force: true });
        await queue.close();
        await deadLetters.close();
        await connection.quit();
      }
    }

    const settled = (consumer: ReturnType<typeof createBullmqIngestWorker>, event: "completed" | "failed") =>
      new Promise<void>((resolve) => consumer.worker.once(event, () => resolve()));

    it("dead-letters an email job it can't process at once, with ids only", async () => {
      await withWorker(mockDb(), async ({ consumer, queue, deadLetters }) => {
        const failed = settled(consumer, "failed");
        await queue.add(
          INGEST_JOB_NAME,
          { kind: "EMAIL", userId: "u-1", payload: { body: "Hi Priya, your OTP is 482913" } },
          { jobId: "ingest-e2e-webhook", attempts: 3 },
        );
        await failed;

        const dead = await deadLetters.getJob(jobIdFrom("ingest-dl", "ingest-e2e-webhook"));
        const entry = IngestDeadLetterJobSchema.parse(dead!.data);
        expect(entry).toMatchObject({ kind: "EMAIL", jobId: "ingest-e2e-webhook", attempts: 1 });
        expect(entry.error).toMatch(/no message or source/);
        expect(JSON.stringify(dead!.data)).not.toMatch(/OTP|Priya|u-1/);
        expect(await deadLetters.count()).toBe(1);
      });
    });

    it("an OAuth rerun after the exchange worked completes; a fresh code without Google config dead-letters", async () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
      const spent = createHash("sha256").update("code-spent").digest("hex").slice(0, 16);
      const db = mockDb({
        source: { id: SOURCE_ID, provider: "gmail", consentGrantId: "g-1", meta: { oauthCodeHash: spent } },
        grant: { id: "g-1", revokedAt: null },
      });
      await withWorker(db, async ({ consumer, queue, deadLetters }) => {
        const completed = settled(consumer, "completed");
        await queue.add(INGEST_OAUTH_JOB_NAME, { sourceId: SOURCE_ID, code: "code-spent", userId: "u-1" }, {
          jobId: "oauth-e2e-rerun",
          attempts: 3,
        });
        await completed;
        expect(db.updates).toHaveLength(0);
        expect(await deadLetters.count()).toBe(0);

        const failed = settled(consumer, "failed");
        await queue.add(INGEST_OAUTH_JOB_NAME, { sourceId: SOURCE_ID, code: "code-fresh", userId: "u-1" }, {
          jobId: "oauth-e2e-fresh",
          attempts: 3,
        });
        await failed;
        const dead = await deadLetters.getJob(jobIdFrom("ingest-dl", "oauth-e2e-fresh"));
        expect(dead!.data).toMatchObject({ kind: "OAUTH", sourceId: SOURCE_ID, attempts: 1 });
        expect(dead!.data.error).toMatch(/Gmail is not configured/);
        expect(JSON.stringify(dead!.data)).not.toMatch(/code-fresh/);
      });
    });

    it("a resync waits out its source's backoff without spending an attempt", async () => {
      recordFailure(SOURCE_ID);
      await withWorker(mockDb(), async ({ queue }) => {
        const job = await queue.add(INGEST_RESYNC_JOB_NAME, { sourceId: SOURCE_ID }, { jobId: "resync-e2e", attempts: 3 });
        let state = await job.getState();
        for (let i = 0; i < 50 && state !== "delayed"; i++) {
          await new Promise((r) => setTimeout(r, 20));
          state = await job.getState();
        }
        expect(state).toBe("delayed");
        const fresh = await queue.getJob("resync-e2e");
        expect(fresh!.attemptsMade).toBe(0);
      });
    });

    it("schedules one resync per source and minute however often it is asked", async () => {
      await withWorker(mockDb(), async ({ consumer, queue }) => {
        await consumer.scheduleResync(SOURCE_ID, 120_000);
        await consumer.scheduleResync(SOURCE_ID, 120_000);
        const delayed = await queue.getDelayed();
        expect(delayed).toHaveLength(1);
        expect(delayed[0]!.opts.attempts).toBe(3);
      });
    });
  });
});
